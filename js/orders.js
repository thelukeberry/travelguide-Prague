// /js/orders.js
// Order placement, status workflow, history queries, feedback, presence.
//
// Status values (single source of truth):
export const STATUSES = [
  "zahlung_ausstehend",
  "offen",
  "bezahlt",
  "in_produktion",
  "abholbereit",
  "abgeschlossen",
  "storniert",
];

export const STATUS_LABELS = {
  zahlung_ausstehend: "Zahlung ausstehend",
  offen:              "Offen",
  bezahlt:            "Bezahlt",
  in_produktion:      "In Produktion",
  abholbereit:        "Abholbereit",
  abgeschlossen:      "Abgeschlossen",
  storniert:          "Storniert",
};

import { FB_READY, db, ref, set, update, get, push, onValue,
         serverTimestamp, query, orderByChild, equalTo, onDisconnect } from "./firebase.js";
import { adjustReferralBonus } from "./auth.js";

const L_ORDERS    = "bd_orders_local_v1";
const L_FEEDBACKS = "bd_feedbacks_local_v1";
const L_SESSIONS  = "bd_sessions_local_v1";

// ──────────────────────────────────────────────────────────────────
// Order CRUD
// ──────────────────────────────────────────────────────────────────
export function serializeOrder({ user, customer, pricing, qty, referral, tip, notes }) {
  const id = "BD-" + Math.floor(100000 + Math.random() * 900000);
  const userId = user && user.uid ? user.uid : "guest";
  return {
    id, userId,
    name: customer.name, email: String(customer.email || "").toLowerCase(), phone: customer.phone,
    notes: String(notes || ""),
    qty: { ...qty },
    pricing: {
      subtotal: pricing.subtotal, tenDiscount: pricing.tenDiscount, fiveDiscount: pricing.fiveDiscount,
      refDiscount: pricing.refDiscount, totalDiscount: pricing.totalDiscount,
      tipAmount: pricing.tipAmount, grandTotal: pricing.grandTotal,
      tens: pricing.tens, fives: pricing.fives,
    },
    referral: referral ? { code: referral.code, percent: referral.percent, ownerUid: referral.ownerUid || null, bonusApplied: false } : null,
    tip: { ...tip },
    paymentStatus: "zahlung_ausstehend",
    timestamp: new Date().toISOString(),
  };
}

export async function saveOrder(order) {
  if (FB_READY && db) {
    try {
      // Master record
      await set(ref(db, `orders/${order.id}`), { ...order, _ts: serverTimestamp() });
      // User-side index (only for registered customers)
      if (order.userId && order.userId !== "guest" && !String(order.userId).startsWith("local:")) {
        await set(ref(db, `userOrders/${order.userId}/${order.id}`), true);
      }
    } catch (e) { console.warn("[orders] cloud save failed", e); }
  }
  // Always mirror locally
  const all = loadLocal();
  all.push(order);
  saveLocal(all);
}

export async function loadAllOrders() {
  if (FB_READY && db) {
    try {
      const snap = await get(ref(db, "orders"));
      const v = snap.val() || {};
      const list = Object.values(v);
      list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return list;
    } catch (e) { console.warn("[orders] cloud read failed, fallback local", e); }
  }
  const local = loadLocal();
  local.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return local;
}

export async function loadOrdersForUser(emailOrUid) {
  const all = await loadAllOrders();
  const e = String(emailOrUid || "").toLowerCase();
  return all.filter(o =>
    String(o.email || "").toLowerCase() === e
    || String(o.userId || "") === emailOrUid
  );
}

/**
 * Atomically updates an order's status. When transitioning into "bezahlt"
 * and the order has an unredeemed referral with a known ownerUid, credits
 * the referrer with +5% to use on their next purchase.
 */
export async function updateOrderStatus(orderId, newStatus) {
  if (!STATUSES.includes(newStatus)) throw new Error("Unbekannter Status: " + newStatus);

  // Find the current order to check referral bonus eligibility
  let order = null;
  if (FB_READY && db) {
    try { const snap = await get(ref(db, `orders/${orderId}`)); order = snap.val(); } catch {}
  }
  if (!order) order = loadLocal().find(o => o.id === orderId) || null;
  if (!order) throw new Error("Bestellung nicht gefunden.");

  const wasPaid = order.paymentStatus === "bezahlt";
  const willBePaid = newStatus === "bezahlt";

  // Persist new status
  if (FB_READY && db) {
    try { await update(ref(db, `orders/${orderId}`), { paymentStatus: newStatus, _ts: serverTimestamp() }); } catch (e) { console.warn(e); }
  }
  // Local mirror
  const list = loadLocal();
  const idx = list.findIndex(o => o.id === orderId);
  if (idx >= 0) { list[idx].paymentStatus = newStatus; saveLocal(list); }

  // Referrer bonus: credit once when status crosses INTO 'bezahlt'
  if (!wasPaid && willBePaid && order.referral && order.referral.ownerUid && !order.referral.bonusApplied) {
    try {
      await adjustReferralBonus(order.referral.ownerUid, +5);
      if (FB_READY && db) {
        await update(ref(db, `orders/${orderId}/referral`), { bonusApplied: true, bonusAppliedAt: serverTimestamp() });
      } else {
        const list2 = loadLocal();
        const i2 = list2.findIndex(o => o.id === orderId);
        if (i2 >= 0 && list2[i2].referral) { list2[i2].referral.bonusApplied = true; saveLocal(list2); }
      }
    } catch (e) { console.warn("[orders] bonus credit failed", e); }
  }
  // Roll-back if a paid order is later un-paid (mistake)
  if (wasPaid && !willBePaid && order.referral && order.referral.ownerUid && order.referral.bonusApplied) {
    try {
      await adjustReferralBonus(order.referral.ownerUid, -5);
      if (FB_READY && db) {
        await update(ref(db, `orders/${orderId}/referral`), { bonusApplied: false });
      } else {
        const list2 = loadLocal();
        const i2 = list2.findIndex(o => o.id === orderId);
        if (i2 >= 0 && list2[i2].referral) { list2[i2].referral.bonusApplied = false; saveLocal(list2); }
      }
    } catch (e) { console.warn("[orders] bonus rollback failed", e); }
  }
}

// ──────────────────────────────────────────────────────────────────
// Feedback (/feedbacks/$key)
// ──────────────────────────────────────────────────────────────────
export async function submitFeedback({ orderId, email, text, rating }) {
  const item = {
    orderId: orderId || null,
    email: String(email || "").toLowerCase() || null,
    text: String(text || "").trim().slice(0, 1000),
    rating: rating != null ? Number(rating) : null,
    createdAt: new Date().toISOString(),
  };
  if (!item.text && !item.rating) return false;
  if (FB_READY && db) {
    try { await push(ref(db, "feedbacks"), item); }
    catch (e) { console.warn("[feedback] cloud failed", e); }
  }
  const list = loadFeedbacksLocal();
  list.push(item);
  saveFeedbacksLocal(list);
  return true;
}

export async function loadFeedbacks() {
  if (FB_READY && db) {
    try { const snap = await get(ref(db, "feedbacks")); return Object.values(snap.val() || {}); }
    catch (e) { console.warn("[feedback] cloud read failed", e); }
  }
  return loadFeedbacksLocal();
}

// ──────────────────────────────────────────────────────────────────
// Anonymous session tracking — for visitor count & avg dwell time
// ──────────────────────────────────────────────────────────────────
const SESSION_ID_KEY = "bd_session_id";
function getSessionId() {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36)).slice(0, 20);
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function startSessionTracking() {
  const id = getSessionId();
  const startedAt = Date.now();

  const localUpdate = (durationMs) => {
    const all = loadSessionsLocal();
    const rec = all[id] || { startedAt, durationMs: 0 };
    rec.durationMs = Math.max(rec.durationMs || 0, durationMs);
    all[id] = rec; saveSessionsLocal(all);
  };
  localUpdate(0);

  if (FB_READY && db) {
    try { set(ref(db, `sessions/${id}`), { startedAt: serverTimestamp(), durationMs: 0 }).catch(() => {}); } catch {}
  }

  // Heartbeat every 20s while alive
  const heartbeat = setInterval(() => {
    const dur = Date.now() - startedAt;
    localUpdate(dur);
    if (FB_READY && db) {
      try { update(ref(db, `sessions/${id}`), { durationMs: dur, lastSeen: serverTimestamp() }).catch(() => {}); } catch {}
    }
  }, 20_000);

  window.addEventListener("beforeunload", () => clearInterval(heartbeat));
}

export async function loadSessionsStats() {
  if (FB_READY && db) {
    try {
      const snap = await get(ref(db, "sessions"));
      const v = snap.val() || {};
      const arr = Object.values(v);
      const total = arr.length;
      const avg = arr.length ? arr.reduce((s, r) => s + (r.durationMs || 0), 0) / arr.length : 0;
      return { totalSessions: total, avgDurationMs: avg };
    } catch {}
  }
  const v = loadSessionsLocal();
  const arr = Object.values(v);
  return {
    totalSessions: arr.length,
    avgDurationMs: arr.length ? arr.reduce((s, r) => s + (r.durationMs || 0), 0) / arr.length : 0,
  };
}

// ──────────────────────────────────────────────────────────────────
// Presence — live count of currently-connected users
// Only marketing-visible when ≥ 3.
// ──────────────────────────────────────────────────────────────────
export function startPresence(onChange) {
  if (!FB_READY || !db) {
    // No realtime presence in local mode; report null so UI hides indicator
    setTimeout(() => onChange && onChange(null), 0);
    return;
  }
  try {
    const sid = getSessionId();
    const connRef  = ref(db, ".info/connected");
    const myRef    = ref(db, `presence/${sid}`);
    const allRef   = ref(db, "presence");

    onValue(connRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(myRef).remove().catch(() => {});
        set(myRef, { since: serverTimestamp() }).catch(() => {});
      }
    });

    onValue(allRef, (snap) => {
      const v = snap.val() || {};
      const count = Object.keys(v).length;
      onChange && onChange(count);
    });
  } catch (e) { console.warn("[presence] failed", e); }
}

// ── local storage helpers
function loadLocal()              { try { return JSON.parse(localStorage.getItem(L_ORDERS)) || []; } catch { return []; } }
function saveLocal(list)          { try { localStorage.setItem(L_ORDERS, JSON.stringify(list)); } catch {} }
function loadFeedbacksLocal()     { try { return JSON.parse(localStorage.getItem(L_FEEDBACKS)) || []; } catch { return []; } }
function saveFeedbacksLocal(list) { try { localStorage.setItem(L_FEEDBACKS, JSON.stringify(list)); } catch {} }
function loadSessionsLocal()      { try { return JSON.parse(localStorage.getItem(L_SESSIONS)) || {}; } catch { return {}; } }
function saveSessionsLocal(map)   { try { localStorage.setItem(L_SESSIONS, JSON.stringify(map)); } catch {} }
