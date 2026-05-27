// /js/referral.js
// Win-Win referral system:
//   • Referred customer gets 5% off immediately when applying a valid code.
//   • Code owner gets +5% credited on their NEXT order, but only after the
//     referred order's status is set to "bezahlt" by the admin (orders.js).
// Codes are FIRSTNAME + 3 digits (LUCAS842). They are ONLY accepted if they
// exist at /referralCodes/$code in Firebase. In local-only mode (no Firebase
// config), codes from the locally-known codes table are accepted.
//
// Anti-abuse: hidden honeypot, 3-strike 10-minute lockout (persisted across
// reloads and tabs).

import { FB_READY, db, ref, get, set, serverTimestamp } from "./firebase.js";
import { state, REFERRAL_PCT, saveCart } from "./cart.js";
import { $, toast } from "./ui.js";

const LOCK_KEY        = "bd_ref_lock_v1";
const LOCAL_CODES_KEY = "bd_ref_codes_v1"; // local-mode mirror: { CODE: { ownerUid, ownerEmail } }
const MAX_ATTEMPTS    = 3;
const LOCK_MINUTES    = 10;

export const REF_PATTERN = /^[A-Z]{2,12}[0-9]{3}$/;

// ──────────────────────────────────────────────────────────────────
// Code generation
// ──────────────────────────────────────────────────────────────────
export function generateCode(firstName) {
  let p = String(firstName || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (p.length < 2) p = "BERRY";
  if (p.length > 12) p = p.slice(0, 12);
  return p + (100 + Math.floor(Math.random() * 900));
}

/** Reserve a NEW code in /referralCodes/$code with retry on collision. */
export async function reserveCode(firstName, ownerUid, ownerEmail) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode(firstName);
    if (FB_READY) {
      try {
        const snap = await get(ref(db, `referralCodes/${code}`));
        if (snap.exists()) continue;
        await set(ref(db, `referralCodes/${code}`), {
          ownerUid, ownerEmail, createdAt: serverTimestamp(),
        });
        return code;
      } catch (e) { console.warn("[referral] reserve failed", e); }
    } else {
      const tab = loadLocalCodes();
      if (tab[code]) continue;
      tab[code] = { ownerUid, ownerEmail, createdAt: Date.now() };
      saveLocalCodes(tab);
      return code;
    }
  }
  // Last-resort: random suffix
  return generateCode(firstName + Math.floor(Math.random() * 100));
}

/** Validate a code by looking it up. Returns { valid, ownerUid?, ownerEmail? }. */
export async function validateCode(code) {
  code = String(code || "").trim().toUpperCase();
  if (!REF_PATTERN.test(code)) return { valid: false };
  if (FB_READY) {
    try {
      const snap = await get(ref(db, `referralCodes/${code}`));
      if (!snap.exists()) return { valid: false };
      const v = snap.val() || {};
      return { valid: true, code, ownerUid: v.ownerUid, ownerEmail: v.ownerEmail };
    } catch (e) { console.warn("[referral] validate failed", e); return { valid: false }; }
  }
  // Local fallback
  const tab = loadLocalCodes();
  const v = tab[code];
  if (!v) return { valid: false };
  return { valid: true, code, ownerUid: v.ownerUid, ownerEmail: v.ownerEmail };
}

function loadLocalCodes() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CODES_KEY)) || {}; }
  catch { return {}; }
}
function saveLocalCodes(map) {
  try { localStorage.setItem(LOCAL_CODES_KEY, JSON.stringify(map)); } catch {}
}

// ──────────────────────────────────────────────────────────────────
// Rate-limit storage (both localStorage AND sessionStorage so it survives
// any tab combination, per spec)
// ──────────────────────────────────────────────────────────────────
function readLockState() {
  let s = { attempts: 0, lockedUntil: 0 };
  try { s = JSON.parse(localStorage.getItem(LOCK_KEY)) || s; } catch {}
  try {
    const ss = JSON.parse(sessionStorage.getItem(LOCK_KEY) || "null");
    if (ss && ss.lockedUntil > s.lockedUntil) s = ss;
  } catch {}
  return s;
}
function writeLockState(s) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(s)); } catch {}
  try { sessionStorage.setItem(LOCK_KEY, JSON.stringify(s)); } catch {}
}

export function isLocked() {
  const s = readLockState();
  return s.lockedUntil > Date.now() ? s.lockedUntil : 0;
}
export function recordInvalidAttempt() {
  const s = readLockState();
  s.attempts = (s.attempts || 0) + 1;
  if (s.attempts >= MAX_ATTEMPTS) {
    s.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
    s.attempts = 0;
  }
  writeLockState(s);
  return s;
}
export function resetAttempts() { writeLockState({ attempts: 0, lockedUntil: 0 }); }

// ──────────────────────────────────────────────────────────────────
// UI wiring
// ──────────────────────────────────────────────────────────────────
let _lockTimer = null;
let _renderCb  = () => {};

export function bindReferralUI(renderCb) {
  _renderCb = renderCb || (() => {});
  const applyBtn = $("#ref-apply");
  const input    = $("#ref-input");
  if (applyBtn) applyBtn.addEventListener("click", () => applyEnteredCode());
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyEnteredCode(); }
    });
  }
  refreshLockUI();
}

function refreshLockUI() {
  const input = $("#ref-input"), btn = $("#ref-apply"), msg = $("#ref-msg");
  if (!input || !btn || !msg) return;
  const until = isLocked();
  if (until > 0) {
    input.disabled = btn.disabled = true;
    input.classList.add("opacity-50");
    btn.classList.add("opacity-50");
    const t = new Date(until).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    msg.innerHTML = `<span class="text-berry font-medium">⛔ Code-Eingabe gesperrt</span> · Wieder verfügbar um ${t} Uhr`;
    msg.className = "text-xs mt-2 text-berry";
    if (!_lockTimer) _lockTimer = setInterval(refreshLockUI, 1000);
  } else {
    input.disabled = btn.disabled = false;
    input.classList.remove("opacity-50");
    btn.classList.remove("opacity-50");
    if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
  }
}

export async function applyEnteredCode(opts = {}) {
  const input = $("#ref-input"), msg = $("#ref-msg"), honey = $("#ref-honey");
  if (!input || !msg) return;

  // Honeypot: bots fill all inputs — silent rejection, no UX hint
  if (honey && honey.value) { console.warn("Honeypot triggered"); return; }

  if (isLocked()) { refreshLockUI(); return; }

  const code = String(input.value || "").trim().toUpperCase();
  if (!code) return;

  // Format check first (cheap), then cloud verification
  if (!REF_PATTERN.test(code)) return handleInvalid("Code-Format passt nicht. Beispiel: LUCAS842");

  const res = await validateCode(code);
  if (!res.valid) return handleInvalid("Diesen Code kennen wir nicht. Tippfehler? Sonst sag deinem Buddy Bescheid.");

  // Valid! Apply
  resetAttempts();
  input.classList.remove("error");
  state.referral = { code, percent: REFERRAL_PCT, ownerUid: res.ownerUid || null, ownerEmail: res.ownerEmail || null };
  input.value = code;
  saveCart();
  msg.innerHTML = `<span class="text-berry font-medium">✦ Code ${code} aktiv</span> · ${REFERRAL_PCT}% Buddy-Rabatt${opts.fromUrl ? " (via Link)" : ""}`;
  msg.className = "text-xs mt-2 text-espresso/70";
  if (!opts.fromUrl) input.blur();
  _renderCb();

  function handleInvalid(reason) {
    input.classList.add("error");
    const s = recordInvalidAttempt();
    if (s.lockedUntil > Date.now()) { refreshLockUI(); state.referral = null; saveCart(); _renderCb(); return; }
    const left = MAX_ATTEMPTS - (s.attempts || 0);
    msg.textContent = `${reason} Noch ${left} Versuch${left === 1 ? "" : "e"} dann gibt's 10 Min Pause.`;
    msg.className = "text-xs mt-2 text-berry";
    state.referral = null; saveCart(); _renderCb();
  }
}

// ──────────────────────────────────────────────────────────────────
// URL ?ref=XYZ123 — auto-apply on page load
// ──────────────────────────────────────────────────────────────────
export async function handleRefURLParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ref");
  if (!raw) return;

  const code = String(raw).trim().toUpperCase();
  if (REF_PATTERN.test(code)) {
    const input = $("#ref-input");
    if (input) input.value = code;
    await applyEnteredCode({ fromUrl: true });
    if (state.referral && state.referral.code === code) {
      toast(`🎁 Code <strong>${code}</strong> aktiv · ${REFERRAL_PCT}% Buddy-Rabatt für dich!`, { color: "#8B1A3B", ms: 3600 });
    }
  }
  // Always clean URL so it's not re-applied on refresh
  params.delete("ref");
  const qs = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
}
