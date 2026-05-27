// /js/admin.js
// Backoffice: stats dashboard, orders list with month filter, order detail
// with status-save dropdown, feedback browser.

import { $, fmt, show, hide, refreshIcons, toast } from "./ui.js";
import { loadAllOrders, updateOrderStatus, STATUSES, STATUS_LABELS,
         loadFeedbacks, loadSessionsStats } from "./orders.js";
import { FLAVORS } from "./cart.js";
import { ADMIN_EMAIL } from "./firebase.js";

const ADMIN_PASS = "LuBe25031997.";
const SK_ADMIN = "bd_admin_session_v1";

const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k) => { const [y, m] = k.split("-"); return `${MONTHS[+m - 1]} ${y}`; };

let _filter = "all";
let _activeView = "orders"; // "orders" | "feedback"

export function isAdminAuthed() { return localStorage.getItem(SK_ADMIN) === "1"; }
export function setAdminAuthed(v) {
  if (v) localStorage.setItem(SK_ADMIN, "1");
  else localStorage.removeItem(SK_ADMIN);
}

export function bindAdminUI() {
  $("#bo-entry")?.addEventListener("click", () => {
    if (isAdminAuthed()) openBackoffice();
    else { show("#bo-login"); setTimeout(() => $("#bo-user")?.focus(), 50); }
  });
  $("#bo-login-close")?.addEventListener("click", () => {
    hide("#bo-login"); $("#bo-pass").value = ""; hide("#bo-login-err");
  });
  $("#bo-login-btn")?.addEventListener("click", tryLogin);
  $("#bo-pass")?.addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
  $("#bo-logout")?.addEventListener("click", () => {
    setAdminAuthed(false); hide("#backoffice"); hide("#bo-detail"); document.body.style.overflow = "";
  });
  $("#bo-detail-back")?.addEventListener("click", () => { hide("#bo-detail"); show("#backoffice"); });

  // View toggles
  $("#bo-tab-orders")?.addEventListener("click", () => switchView("orders"));
  $("#bo-tab-feedback")?.addEventListener("click", () => switchView("feedback"));
}

function tryLogin() {
  const u = ($("#bo-user").value || "").trim().toLowerCase();
  const p = $("#bo-pass").value || "";
  if (u === ADMIN_EMAIL.toLowerCase() && p === ADMIN_PASS) {
    setAdminAuthed(true);
    hide("#bo-login"); $("#bo-pass").value = ""; hide("#bo-login-err");
    openBackoffice();
  } else {
    show("#bo-login-err");
    $("#bo-pass").classList.add("error");
    setTimeout(() => $("#bo-pass").classList.remove("error"), 1200);
  }
}

async function openBackoffice() {
  show("#backoffice");
  document.body.style.overflow = "hidden";
  await render();
  refreshIcons();
}

function switchView(v) {
  _activeView = v;
  $("#bo-tab-orders")?.classList.toggle("active", v === "orders");
  $("#bo-tab-feedback")?.classList.toggle("active", v === "feedback");
  toggle("#bo-view-orders", v === "orders");
  toggle("#bo-view-feedback", v === "feedback");
  render();
}

function toggle(sel, visible) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (el) el.classList.toggle("hidden", !visible);
}

async function render() {
  const [orders, feedbacks, sessions] = await Promise.all([
    loadAllOrders(), loadFeedbacks(), loadSessionsStats(),
  ]);
  renderStats(orders, sessions, feedbacks);
  if (_activeView === "orders")   renderOrdersList(orders);
  if (_activeView === "feedback") renderFeedbackList(feedbacks);
}

function renderStats(orders, sessions, feedbacks) {
  const totalOrders  = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + (o?.pricing?.grandTotal  || 0), 0);
  const totalSavings = orders.reduce((s, o) => s + (o?.pricing?.totalDiscount || 0), 0);

  // Best-selling flavor (renner)
  const flavorTotals = { chocolate: 0, vanilla: 0, caramel: 0 };
  orders.forEach(o => {
    flavorTotals.chocolate += o?.qty?.chocolate || 0;
    flavorTotals.vanilla   += o?.qty?.vanilla   || 0;
    flavorTotals.caramel   += o?.qty?.caramel   || 0;
  });
  const sortedFlavors = Object.entries(flavorTotals).sort((a, b) => b[1] - a[1]);
  const topName = sortedFlavors[0]?.[0] ? (FLAVORS.find(f => f.id === sortedFlavors[0][0])?.name || "—") : "—";

  // Status breakdown
  const byStatus = {};
  STATUSES.forEach(s => byStatus[s] = 0);
  orders.forEach(o => { byStatus[o.paymentStatus || "zahlung_ausstehend"] = (byStatus[o.paymentStatus || "zahlung_ausstehend"] || 0) + 1; });

  const avgMin = sessions.avgDurationMs ? Math.round(sessions.avgDurationMs / 60_000 * 10) / 10 : 0;
  const totalVisits = sessions.totalSessions || 0;
  const totalPints = flavorTotals.chocolate + flavorTotals.vanilla + flavorTotals.caramel;
  const avgOrderValue = totalOrders ? (totalRevenue / totalOrders) : 0;

  const html = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${statCard("Bestellungen", totalOrders, "shopping-bag")}
      ${statCard("Umsatz", fmt(totalRevenue), "trending-up")}
      ${statCard("Rabatte ausgegeben", fmt(totalSavings), "percent")}
      ${statCard("Ø Warenkorb", fmt(avgOrderValue), "calculator")}
      ${statCard("Besucher (Sessions)", totalVisits, "users")}
      ${statCard("Ø Verweildauer", avgMin + " Min", "clock")}
      ${statCard("Pints insgesamt", totalPints, "ice-cream-cone")}
      ${statCard("Feedbacks", feedbacks.length, "message-square")}
    </div>

    <div class="mt-5 rounded-2xl bg-white border border-espresso/8 p-4 shadow-soft">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-display text-base font-semibold">Renner-Penner Liste</h3>
        <span class="text-[10px] uppercase tracking-widest text-espresso/55">Sorten</span>
      </div>
      <ol class="space-y-2">
        ${sortedFlavors.map(([id, n], i) => {
          const fl = FLAVORS.find(f => f.id === id);
          return `<li class="flex items-center justify-between text-sm">
            <span><strong class="text-berry">${i + 1}.</strong> ${fl ? fl.name : id}</span>
            <span class="font-semibold tabular-nums">${n}× verkauft</span>
          </li>`;
        }).join("")}
      </ol>
      <p class="mt-2 text-xs text-espresso/55">🏆 Top-Sorte: <strong>${topName}</strong></p>
    </div>

    <div class="mt-3 rounded-2xl bg-white border border-espresso/8 p-4 shadow-soft">
      <h3 class="font-display text-base font-semibold mb-3">Status-Übersicht</h3>
      <div class="grid grid-cols-2 gap-2 text-sm">
        ${STATUSES.map(s => `
          <div class="flex justify-between rounded-xl bg-cream/40 px-3 py-2">
            <span>${STATUS_LABELS[s]}</span>
            <span class="font-semibold tabular-nums">${byStatus[s] || 0}</span>
          </div>`).join("")}
      </div>
    </div>
  `;
  const wrap = $("#bo-stats");
  if (wrap) wrap.innerHTML = html;
}

function statCard(title, value, icon) {
  return `
    <div class="rounded-2xl bg-white border border-espresso/8 p-3 shadow-soft">
      <div class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-espresso/55">
        <i data-lucide="${icon}" class="w-3 h-3"></i> ${title}
      </div>
      <div class="font-display text-xl font-semibold mt-1">${value}</div>
    </div>`;
}

function renderOrdersList(orders) {
  // Month filter
  const months = new Set();
  orders.forEach(o => { try { months.add(monthKey(new Date(o.timestamp))); } catch {} });
  const monthList = [...months].sort().reverse();

  const pills = [`<button class="filter-pill ${_filter === "all" ? "active" : ""}" data-filter="all">Alle (${orders.length})</button>`];
  monthList.forEach(k => {
    const count = orders.filter(o => monthKey(new Date(o.timestamp)) === k).length;
    pills.push(`<button class="filter-pill ${_filter === k ? "active" : ""}" data-filter="${k}">${monthLabel(k)} (${count})</button>`);
  });
  const filters = $("#bo-filters"); if (filters) filters.innerHTML = pills.join("");
  filters?.querySelectorAll("[data-filter]").forEach(b => {
    b.addEventListener("click", () => { _filter = b.dataset.filter; render(); });
  });

  // Filtered list
  let list = orders.slice();
  if (_filter !== "all") list = list.filter(o => monthKey(new Date(o.timestamp)) === _filter);

  const empty = $("#bo-empty"), boList = $("#bo-list");
  if (!list.length) { boList?.classList.add("hidden"); empty?.classList.remove("hidden"); return; }
  empty?.classList.add("hidden"); boList?.classList.remove("hidden");

  boList.innerHTML = list.map(o => {
    const d = new Date(o.timestamp);
    const dStr = d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const totalItems = (o.qty?.chocolate || 0) + (o.qty?.vanilla || 0) + (o.qty?.caramel || 0);
    const status = o.paymentStatus || "zahlung_ausstehend";
    return `
      <button class="order-card no-select w-full text-left" data-order-id="${o.id}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-[10px] uppercase tracking-widest text-espresso/55">${dStr}</div>
            <div class="font-display text-base font-semibold mt-0.5">${o.id} · ${o.name || "Gast"}</div>
            <div class="text-xs text-espresso/60 mt-1 truncate">${totalItems} Pint${totalItems === 1 ? "" : "s"} · ${o.email || "—"}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-display text-lg font-semibold">${(o.pricing?.grandTotal || 0).toFixed(2)}</div>
            <div class="text-[10px] uppercase tracking-widest text-espresso/55">CHF</div>
            <div class="mt-1 status-pill status-${status.replace(/_/g, "-")}">${STATUS_LABELS[status] || status}</div>
          </div>
        </div>
      </button>`;
  }).join("");

  boList.querySelectorAll("[data-order-id]").forEach(b => {
    b.addEventListener("click", () => showOrderDetail(b.dataset.orderId, orders));
  });
}

async function showOrderDetail(id, ordersCache) {
  const orders = ordersCache || await loadAllOrders();
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const d = new Date(o.timestamp);
  const p = o.pricing || {};

  const itemRows = FLAVORS.filter(f => (o.qty?.[f.id] || 0) > 0).map(f => `
    <div class="flex justify-between text-sm py-1">
      <span>${o.qty[f.id]}× ${f.name}</span>
      <span class="text-espresso/70">${(o.qty[f.id] * 12).toFixed(2)} CHF</span>
    </div>`).join("");

  const discountRows = [];
  if (p.tenDiscount  > 0) discountRows.push(line("10er-Pack (10%)", -p.tenDiscount, "text-berry"));
  if (p.fiveDiscount > 0) discountRows.push(line("5er-Pack (5%)",   -p.fiveDiscount, "text-berry"));
  if (p.refDiscount  > 0 && o.referral) discountRows.push(line(`Empfehlung ${o.referral.code} (5%)`, -p.refDiscount, "text-berry"));
  if (p.tipAmount    > 0) discountRows.push(line("Trinkgeld", p.tipAmount, "text-espresso/60"));

  const statusButtons = STATUSES.map(s => `
    <option value="${s}" ${o.paymentStatus === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>
  `).join("");

  $("#bo-detail-content").innerHTML = `
    <div class="rounded-2xl bg-white border border-espresso/8 p-5 shadow-card">
      <div class="text-[10px] uppercase tracking-widest text-espresso/55">${d.toLocaleString("de-CH")}</div>
      <h2 class="font-display text-2xl font-semibold mt-1">${o.id}</h2>
      <p class="text-espresso/70 text-sm mt-1">${o.name || "Gast"}</p>
    </div>

    <div class="mt-4 rounded-2xl bg-white border border-espresso/8 p-5 shadow-soft">
      <p class="text-[10px] uppercase tracking-widest text-espresso/55 mb-2">Kontakt</p>
      <div class="space-y-1.5 text-sm">
        <div class="flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-espresso/55"></i><span>${o.name || "—"}</span></div>
        <div class="flex items-center gap-2"><i data-lucide="mail" class="w-4 h-4 text-espresso/55"></i><a class="underline" href="mailto:${o.email}">${o.email || "—"}</a></div>
        <div class="flex items-center gap-2"><i data-lucide="phone" class="w-4 h-4 text-espresso/55"></i><a class="underline" href="tel:${o.phone}">${o.phone || "—"}</a></div>
        ${o.userId === "guest" ? '<div class="mt-1 text-[10px] uppercase tracking-widest text-espresso/55">Gast-Bestellung</div>' : ""}
      </div>
    </div>

    ${o.notes ? `
    <div class="mt-4 rounded-2xl bg-blush/30 border border-berry/15 p-5 shadow-soft">
      <p class="text-[10px] uppercase tracking-widest text-berryd mb-2">Hinweise des Kunden</p>
      <p class="text-sm text-espresso/85 whitespace-pre-line">${escapeHtml(o.notes)}</p>
    </div>` : ""}

    <div class="mt-4 rounded-2xl bg-white border border-espresso/8 p-5 shadow-soft">
      <p class="text-[10px] uppercase tracking-widest text-espresso/55 mb-2">Artikel</p>
      ${itemRows || '<p class="text-sm text-espresso/55">Keine Artikel</p>'}
    </div>

    <div class="mt-4 rounded-2xl bg-white border border-espresso/8 p-5 shadow-soft">
      <p class="text-[10px] uppercase tracking-widest text-espresso/55 mb-2">Abrechnung</p>
      ${line("Zwischensumme", p.subtotal, "text-espresso/60")}
      ${discountRows.join("")}
      <div class="hairline my-3"></div>
      <div class="flex justify-between"><span class="font-display text-base">Total</span><span class="font-display text-lg font-semibold">${(p.grandTotal || 0).toFixed(2)} CHF</span></div>
    </div>

    ${o.referral ? `
    <div class="mt-4 rounded-2xl bg-white border border-espresso/8 p-5 shadow-soft">
      <p class="text-[10px] uppercase tracking-widest text-espresso/55 mb-2">Empfehlung</p>
      <div class="text-sm space-y-1">
        <div>Code: <strong>${o.referral.code}</strong> (${o.referral.percent}%)</div>
        ${o.referral.ownerUid ? `<div>Werber-UID: <code class="text-xs">${o.referral.ownerUid}</code></div>` : ""}
        <div>Bonus an Werber: <strong>${o.referral.bonusApplied ? "ausbezahlt ✓" : "wartet auf 'bezahlt'"}</strong></div>
      </div>
    </div>` : ""}

    <div class="mt-4 rounded-2xl bg-white border border-espresso/8 p-5 shadow-soft">
      <p class="text-[10px] uppercase tracking-widest text-espresso/55 mb-2">Status</p>
      <div class="flex gap-2 items-center">
        <select id="bo-status-select" class="input flex-1">${statusButtons}</select>
        <button id="bo-status-save" class="px-4 rounded-2xl btn-berry text-sm font-medium">Status Speichern</button>
      </div>
      <p id="bo-status-msg" class="hidden mt-2 text-xs text-berry"></p>
    </div>
  `;
  hide("#backoffice"); show("#bo-detail");
  window.scrollTo?.({ top: 0, behavior: "instant" });
  refreshIcons();

  $("#bo-status-save")?.addEventListener("click", async () => {
    const sel = $("#bo-status-select");
    const newS = sel.value;
    sel.disabled = true;
    try {
      await updateOrderStatus(o.id, newS);
      o.paymentStatus = newS;
      $("#bo-status-msg").innerHTML = `<span class="text-berry font-medium">✓ Gespeichert</span> · Status ist jetzt <strong>${STATUS_LABELS[newS]}</strong>`;
      show("#bo-status-msg");
      toast(`Status gespeichert: ${STATUS_LABELS[newS]}`, { color: "#8B1A3B" });
    } catch (e) {
      $("#bo-status-msg").textContent = "Speichern fehlgeschlagen: " + e.message;
      show("#bo-status-msg");
    } finally { sel.disabled = false; }
  });
}

function renderFeedbackList(items) {
  const wrap = $("#bo-feedback-list"); if (!wrap) return;
  if (!items.length) {
    wrap.innerHTML = `<div class="text-center py-10 text-sm text-espresso/55">Noch kein Feedback eingegangen.</div>`;
    return;
  }
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  wrap.innerHTML = items.map(f => {
    const d = new Date(f.createdAt);
    return `<div class="rounded-2xl bg-white border border-espresso/8 p-4 shadow-soft">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <div class="text-[10px] uppercase tracking-widest text-espresso/55">${d.toLocaleString("de-CH")}</div>
          <div class="text-sm font-medium">${f.email || "Anonym"}</div>
          ${f.orderId ? `<div class="text-[10px] text-espresso/50">Bestellung ${f.orderId}</div>` : ""}
        </div>
        ${f.rating != null ? `<div class="text-lg">${stars(f.rating)}</div>` : ""}
      </div>
      <p class="text-sm text-espresso/80 whitespace-pre-line">${escapeHtml(f.text || "")}</p>
    </div>`;
  }).join("");
}

function stars(n) { n = Math.max(0, Math.min(5, Math.round(n))); return "★".repeat(n) + "☆".repeat(5 - n); }
function line(label, n, cls = "") { return `<div class="flex justify-between text-sm ${cls}"><span>${label}</span><span>${Number(n).toFixed(2)} CHF</span></div>`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
