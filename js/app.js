// /js/app.js
// Entry point. Wires modules to the DOM declared in index.html.
// Imported once via <script type="module" src="./js/app.js"></script>.

import { FB_READY } from "./firebase.js";
import { $, $$, fmt, show, hide, toast, refreshIcons,
         isEmailValid, validateSwissMobile, ERR } from "./ui.js";
import { state, FLAVORS, PRICE, REFERRAL_PCT,
         priceCart, saveCart, loadCart, clearCartItems, savingsToPints } from "./cart.js";
import { initAuth, onAuthChange, currentUser, registerCustomer, loginCustomer,
         logoutCustomer, verifyFromURL, getProfile, adjustReferralBonus } from "./auth.js";
import { bindReferralUI, handleRefURLParam } from "./referral.js";
import { STATUSES, STATUS_LABELS, serializeOrder, saveOrder,
         loadOrdersForUser, submitFeedback, startSessionTracking, startPresence } from "./orders.js";
import { bindAdminUI, isAdminAuthed } from "./admin.js";

// Defensive: stub lucide so other modules can call createIcons safely
if (!window.lucide || typeof window.lucide.createIcons !== "function") {
  window.lucide = { createIcons: () => {} };
}

// ════════════════════════════════════════════════════════════════
// FLAVOR CARDS
// ════════════════════════════════════════════════════════════════
function renderFlavors() {
  const grid = $("#flavor-grid"); if (!grid) return;
  grid.innerHTML = FLAVORS.map(f => `
    <article class="bg-white rounded-3xl p-4 shadow-card border border-espresso/5">
      <div class="flex gap-4 items-center">
        <div class="${f.gradient} rounded-2xl w-24 h-28 shrink-0 relative overflow-hidden flex items-center justify-center">
          <div class="pint"><div class="pint-label" style="color:${f.labelColor}">Berry's<small>${f.id.toUpperCase()}</small></div></div>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-display text-lg font-semibold leading-tight">${f.name}</h3>
          <p class="text-xs text-espresso/55 mt-0.5">${f.tagline}</p>
          <div class="mt-3 flex items-center justify-between gap-2">
            <span class="font-display text-base font-semibold">${fmt(PRICE)}</span>
            <div class="flex items-center gap-2">
              <button class="qty-btn" data-act="dec" data-id="${f.id}" aria-label="Weniger"><i data-lucide="minus" class="w-4 h-4"></i></button>
              <span class="count font-display text-lg font-semibold w-6 text-center" data-count="${f.id}">0</span>
              <button class="qty-btn primary" data-act="inc" data-id="${f.id}" aria-label="Mehr"><i data-lucide="plus" class="w-4 h-4"></i></button>
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 mt-3">
        <button class="pack-btn" data-pack="${f.id}" data-size="5"><i data-lucide="plus" class="w-4 h-4"></i><span>5er-Pack</span><span class="save">−5%</span></button>
        <button class="pack-btn" data-pack="${f.id}" data-size="10"><i data-lucide="plus" class="w-4 h-4"></i><span>10er-Pack</span><span class="save">−10%</span></button>
      </div>
    </article>`).join("");
  refreshIcons();

  grid.addEventListener("click", (e) => {
    const qbtn = e.target.closest("[data-act]");
    const pbtn = e.target.closest("[data-pack]");
    if (qbtn) {
      const id = qbtn.dataset.id, act = qbtn.dataset.act;
      if (act === "inc") state.qty[id]++;
      else if (act === "dec" && state.qty[id] > 0) state.qty[id]--;
      bump(id); renderAll();
    } else if (pbtn) {
      state.qty[pbtn.dataset.pack] += Number(pbtn.dataset.size) || 5;
      bump(pbtn.dataset.pack); renderAll();
    }
  });
}

function bump(id) {
  $$(`[data-count="${id}"]`).forEach(el => {
    el.classList.add("bump"); setTimeout(() => el.classList.remove("bump"), 220);
  });
}

// ════════════════════════════════════════════════════════════════
// FULL CART RENDER
// ════════════════════════════════════════════════════════════════
function renderAll() {
  const p = priceCart();
  FLAVORS.forEach(f => $$(`[data-count="${f.id}"]`).forEach(el => el.textContent = state.qty[f.id]));

  toggle($("#cart-bar"), p.totalItems > 0);
  $("#cart-count")  && ($("#cart-count").textContent   = p.totalItems);
  $("#cart-summary")&& ($("#cart-summary").textContent = `${p.totalItems} ${p.totalItems === 1 ? "Pint" : "Pints"}`);
  $("#cart-total")  && ($("#cart-total").textContent   = fmt(p.grandTotal));

  toggle($("#cart-badge"), p.totalItems > 0);
  if (p.totalItems > 0 && $("#cart-badge")) $("#cart-badge").textContent = p.totalItems;

  toggle($("#cart-empty"), p.totalItems === 0);
  toggle($("#cart-detail"), p.totalItems > 0);

  if (p.totalItems > 0) {
    renderCartItems();
    renderSummary(p);
    renderExpress(p);
    renderTip(p);
  }
  saveCart();
}

function toggle(el, vis) { if (el) el.classList.toggle("hidden", !vis); }

function renderCartItems() {
  const wrap = $("#cart-items"); if (!wrap) return;
  wrap.innerHTML = FLAVORS.filter(f => state.qty[f.id] > 0).map(f => `
    <div class="flex items-center gap-3 bg-white rounded-2xl p-2.5 border border-espresso/8">
      <div class="${f.gradient} w-12 h-14 rounded-xl shrink-0"></div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm truncate">${f.name}</div>
        <div class="text-xs text-espresso/55 mt-0.5">${fmt(PRICE)} · Pint</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="qty-btn" data-act="dec" data-id="${f.id}"><i data-lucide="minus" class="w-4 h-4"></i></button>
        <span class="count w-5 text-center text-sm font-semibold" data-count="${f.id}">${state.qty[f.id]}</span>
        <button class="qty-btn primary" data-act="inc" data-id="${f.id}"><i data-lucide="plus" class="w-4 h-4"></i></button>
      </div>
    </div>`).join("");
  refreshIcons();
  wrap.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.id, act = b.dataset.act;
    if (act === "inc") state.qty[id]++;
    else if (act === "dec" && state.qty[id] > 0) state.qty[id]--;
    renderAll();
  }));
}

function renderSummary(p) {
  const lines = [];
  if (p.tens > 0)  lines.push(rowBadge("10er", `Choco ${p.packs.chocolate.tens}× · Vanilla ${p.packs.vanilla.tens}× · Caramel ${p.packs.caramel.tens}×`, "10%", -p.tenDiscount));
  if (p.fives > 0) lines.push(rowBadge("5er", `Choco ${p.packs.chocolate.fives}× · Vanilla ${p.packs.vanilla.fives}× · Caramel ${p.packs.caramel.fives}×`, "5%", -p.fiveDiscount));
  if (p.refDiscount > 0 && state.referral) lines.push(rowBadge("Buddy", state.referral.code, REFERRAL_PCT + "%", -p.refDiscount));
  const dl = $("#discount-lines"); if (dl) { dl.innerHTML = lines.join(""); dl.classList.toggle("hidden", lines.length === 0); }

  $("#subtotal").textContent   = fmt(p.subtotal);
  $("#grand-total").textContent = fmt(p.grandTotal);
  const dt = $("#discount-total-line");
  if (p.totalDiscount > 0) {
    dt?.classList.remove("hidden"); dt?.classList.add("flex");
    $("#discount-total").textContent = `−${p.totalDiscount.toFixed(2)} CHF`;
    show("#save-note"); $("#save-amount").textContent = p.totalDiscount.toFixed(2);
  } else {
    dt?.classList.add("hidden"); dt?.classList.remove("flex");
    hide("#save-note");
  }
  const tl = $("#tip-line");
  if (p.tipAmount > 0) { tl?.classList.remove("hidden"); tl?.classList.add("flex"); $("#tip-line-amount").textContent = fmt(p.tipAmount); }
  else { tl?.classList.add("hidden"); tl?.classList.remove("flex"); }
}
function rowBadge(label, detail, pct, delta) {
  return `<div class="flex items-center justify-between">
    <span class="flex items-center gap-2 min-w-0"><span class="badge badge-bundle">${label}</span><span class="text-espresso/65 text-xs truncate">${detail} · ${pct}</span></span>
    <span class="text-berry font-medium">${delta.toFixed(2)} CHF</span>
  </div>`;
}

function renderExpress(p) {
  const banner = $("#guest-banner");
  if (banner) banner.classList.toggle("hidden", !!currentUser() || p.totalItems === 0);
  const counter = $("#protein-counter"); if (counter) counter.classList.toggle("hidden", p.totalItems === 0);
  $("#pc-protein") && ($("#pc-protein").textContent = p.proteinG);
  $("#pc-savings") && ($("#pc-savings").textContent = (p.totalDiscount || 0).toFixed(2));
}

function renderTip(p) {
  $("#tip-amount").textContent = fmt(p.tipAmount);
  document.querySelectorAll(".tip-pill").forEach(b => {
    const v = b.dataset.tip;
    let active = false;
    if (v === "custom") active = state.tip.type === "fixed";
    else active = state.tip.type === "percent" && state.tip.value === Number(v);
    b.classList.toggle("active", active);
  });
}

// Tip pills
document.addEventListener("click", (e) => {
  const b = e.target.closest(".tip-pill"); if (!b) return;
  const v = b.dataset.tip;
  if (v === "custom") {
    state.tip = { type: "fixed", value: Number($("#tip-custom").value) || 0 };
    $("#tip-custom-wrap").classList.remove("hidden");
    setTimeout(() => $("#tip-custom")?.focus(), 50);
  } else {
    state.tip = { type: "percent", value: Number(v) };
    $("#tip-custom-wrap").classList.add("hidden"); $("#tip-custom").value = "";
  }
  renderAll();
});
document.addEventListener("input", (e) => {
  if (e.target.id === "tip-custom") {
    state.tip = { type: "fixed", value: Number(e.target.value) || 0 }; renderAll();
  }
});

// ════════════════════════════════════════════════════════════════
// CART SHEET
// ════════════════════════════════════════════════════════════════
function openCart()  { $("#cart-sheet").classList.add("open");    document.body.style.overflow = "hidden"; }
function closeCart() { $("#cart-sheet").classList.remove("open"); document.body.style.overflow = ""; }
$("#open-cart")?.addEventListener("click", openCart);
$("#open-cart-top")?.addEventListener("click", openCart);
$("#close-cart")?.addEventListener("click", closeCart);
$("#cart-sheet")?.addEventListener("click", (e) => { if (e.target.id === "cart-sheet") closeCart(); });

// Customer form fields → state
["f-name","f-email","f-phone","f-notes"].forEach(id => {
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === id) {
      const k = id === "f-name" ? "name" : id === "f-email" ? "email" : id === "f-phone" ? "phone" : "notes";
      state.customer[k] = e.target.value;
      saveCart();
      e.target.classList.remove("error");
    }
  });
});

function hydrateForm() {
  if (state.customer.name)  $("#f-name").value  = state.customer.name;
  if (state.customer.email) $("#f-email").value = state.customer.email;
  if (state.customer.phone) $("#f-phone").value = state.customer.phone;
  if (state.customer.notes) $("#f-notes").value = state.customer.notes;
  if (state.referral?.code) $("#ref-input").value = state.referral.code;
  if (state.tip?.type === "fixed" && state.tip.value > 0) {
    $("#tip-custom").value = state.tip.value;
    $("#tip-custom-wrap").classList.remove("hidden");
  }
}

// ════════════════════════════════════════════════════════════════
// CHECKOUT (TWINT)
// ════════════════════════════════════════════════════════════════
const MERCHANT_TWINT = "+41 78 919 98 38";
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
function openTwintApp() {
  if (!isMobile) return;
  const a = document.createElement("a");
  a.href = "twint://"; a.style.display = "none";
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 100);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

$("#pay-twint")?.addEventListener("click", async () => {
  if (document.activeElement?.blur) document.activeElement.blur();

  const name  = state.customer.name = ($("#f-name").value || "").trim();
  const email = state.customer.email = ($("#f-email").value || "").trim().toLowerCase();
  const phone = ($("#f-phone").value || "").trim();
  const notes = state.customer.notes = ($("#f-notes").value || "").trim();

  let ok = true; const formErr = $("#form-err");
  formErr?.classList.add("hidden");
  if (!name)                { $("#f-name").classList.add("error");  ok = false; }
  if (!isEmailValid(email)) { $("#f-email").classList.add("error"); formErr.textContent = ERR.emailFormat; formErr.classList.remove("hidden"); ok = false; }
  const ph = validateSwissMobile(phone);
  if (!ph.ok)               { $("#f-phone").classList.add("error"); formErr.textContent = ph.error;       formErr.classList.remove("hidden"); ok = false; }
  if (!ok) return;
  state.customer.phone = ph.formatted;
  $("#f-phone").value = ph.formatted;
  saveCart();

  const p = priceCart();
  if (p.totalItems === 0) return;

  const btn = $("#pay-twint"); btn.disabled = true;
  openTwintApp();
  closeCart();
  await runPaymentAnimation(p);

  const user = currentUser();
  const order = serializeOrder({ user, customer: state.customer, pricing: p, qty: state.qty, referral: state.referral, tip: state.tip, notes });
  try { await saveOrder(order); } catch (e) { console.warn(e); }

  // If the customer used their own accumulated 5%-bonus, zero it out now
  if (user && user.uid && Number(user.referralBonusPercent) > 0 && state.referral && state.referral.code === user.refCode) {
    try { await adjustReferralBonus(user.uid, -Number(user.referralBonusPercent)); } catch {}
  }

  clearCartItems();
  hydrateForm();
  showConfirmation(order);
  btn.disabled = false;
});

async function runPaymentAnimation(p) {
  const ov = $("#pay-overlay"); ov.classList.remove("hidden"); ov.classList.add("flex");
  $("#pay-step-1").classList.remove("hidden");
  $("#pay-step-2").classList.add("hidden"); $("#pay-step-3").classList.add("hidden");
  $("#pay-step-3-amount").textContent = `${fmt(p.grandTotal)} an ${MERCHANT_TWINT}`;
  await sleep(1400); $("#pay-step-1").classList.add("hidden"); $("#pay-step-2").classList.remove("hidden");
  await sleep(1500); $("#pay-step-2").classList.add("hidden"); $("#pay-step-3").classList.remove("hidden");
  await sleep(1500); ov.classList.add("hidden"); ov.classList.remove("flex");
}

function showConfirmation(order) {
  show("#confirmation");
  document.body.style.overflow = "hidden";
  $("#conf-greeting").textContent = `Vielen Dank, ${(order.name || "").split(" ")[0] || "Champ"}!`;
  $("#conf-orderid").textContent  = order.id;
  $("#conf-items").innerHTML = FLAVORS.filter(f => order.qty[f.id] > 0).map(f => `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3"><div class="${f.gradient} w-8 h-9 rounded-md"></div><span>${order.qty[f.id]}× ${f.name}</span></div>
      <span class="text-espresso/70">${fmt(order.qty[f.id] * PRICE)}</span>
    </div>`).join("");
  const p = order.pricing;
  const disc = [];
  disc.push(`<div class="flex justify-between"><span class="text-espresso/60">Zwischensumme</span><span>${fmt(p.subtotal)}</span></div>`);
  if (p.tenDiscount  > 0) disc.push(`<div class="flex justify-between text-berry"><span>10er-Pack (10%)</span><span>−${p.tenDiscount.toFixed(2)} CHF</span></div>`);
  if (p.fiveDiscount > 0) disc.push(`<div class="flex justify-between text-berry"><span>5er-Pack (5%)</span><span>−${p.fiveDiscount.toFixed(2)} CHF</span></div>`);
  if (p.refDiscount  > 0 && order.referral) disc.push(`<div class="flex justify-between text-berry"><span>Empfehlung (${order.referral.percent}%)</span><span>−${p.refDiscount.toFixed(2)} CHF</span></div>`);
  if (p.tipAmount    > 0) disc.push(`<div class="flex justify-between"><span class="text-espresso/60">Trinkgeld</span><span>${fmt(p.tipAmount)}</span></div>`);
  $("#conf-discounts").innerHTML = disc.join("");
  $("#conf-total").textContent = fmt(p.grandTotal);
  $("#conf-status").innerHTML = `<span class="status-pill status-zahlung-ausstehend">Zahlung wird geprüft… ⏳</span>`;
  refreshIcons();

  // Feedback form (post-order)
  const fbWrap = $("#conf-feedback-wrap");
  if (fbWrap) {
    fbWrap.classList.remove("hidden");
    $("#conf-feedback-text").value = "";
    $("#conf-feedback-submit")?.addEventListener("click", async () => {
      const text = $("#conf-feedback-text").value;
      const ok = await submitFeedback({ orderId: order.id, email: order.email, text });
      if (ok) { fbWrap.innerHTML = `<div class="text-center text-sm text-berry py-3">💜 Merci fürs Feedback!</div>`; }
    }, { once: true });
  }
}

$("#new-order")?.addEventListener("click", () => {
  hide("#confirmation"); document.body.style.overflow = "";
  renderAll(); window.scrollTo({ top: 0, behavior: "smooth" });
});

// ════════════════════════════════════════════════════════════════
// AUTH UI (header → modal → portal)
// ════════════════════════════════════════════════════════════════
$("#open-account")?.addEventListener("click", () => {
  if (currentUser()) openPortal();
  else { show("#cust-auth"); switchAuthTab("login"); setTimeout(() => $("#login-email")?.focus(), 50); }
});
$("#cust-auth-close")?.addEventListener("click", () => { hide("#cust-auth"); });
$("#cust-auth")?.addEventListener("click", (e) => { if (e.target.id === "cust-auth") hide("#cust-auth"); });
$("#tab-login")?.addEventListener("click", () => switchAuthTab("login"));
$("#tab-register")?.addEventListener("click", () => switchAuthTab("register"));

function switchAuthTab(which) {
  const isLogin = which === "login";
  $("#tab-login")?.classList.toggle("active", isLogin);
  $("#tab-register")?.classList.toggle("active", !isLogin);
  $("#form-login")?.classList.toggle("hidden", !isLogin);
  $("#form-register")?.classList.toggle("hidden", isLogin);
  hide("#verify-prompt"); hide("#login-err"); hide("#login-not-verified"); hide("#reg-err");
}

$("#form-register")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#reg-err"); hide(err);
  try {
    const res = await registerCustomer({
      firstName:       $("#reg-firstname").value,
      email:           $("#reg-email").value,
      password:        $("#reg-pass").value,
      passwordConfirm: $("#reg-pass2").value,
    });
    hide("#form-register"); show("#verify-prompt");
    const msg = $("#verify-msg");
    if (res.verifyEmailSent) msg.textContent = `Bestätigungs-Mail an ${$("#reg-email").value} versendet. Klick den Link, dann kannst du dich anmelden.`;
    else {
      msg.innerHTML = `Lokaler Modus: keine echte E-Mail. Aktiviere mit diesem Link direkt:`;
      $("#verify-manual-link").href = res.manualLink;
      $("#verify-manual-link").textContent = res.manualLink;
      show("#verify-manual-wrap");
    }
  } catch (e2) { err.textContent = e2.message || "Registrierung fehlgeschlagen."; show(err); }
});

$("#form-login")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-err"); const nv = $("#login-not-verified");
  hide(err); hide(nv);
  try {
    await loginCustomer({ email: $("#login-email").value, password: $("#login-pass").value });
    hide("#cust-auth");
    openPortal();
  } catch (e2) {
    if (e2.code === "NOT_VERIFIED") show(nv);
    else { err.textContent = e2.message || "Anmeldung fehlgeschlagen."; show(err); }
  }
});

$("#cust-logout")?.addEventListener("click", async () => {
  await logoutCustomer(); hide("#cust-portal"); document.body.style.overflow = "";
});
$("#cust-close")?.addEventListener("click", () => { hide("#cust-portal"); document.body.style.overflow = ""; });

async function openPortal() {
  const u = currentUser(); if (!u) return;
  show("#cust-portal"); document.body.style.overflow = "hidden";
  await renderPortal(u);
  refreshIcons();
}

async function renderPortal(u) {
  // Pull profile (firstName, refCode, accumulated bonus)
  const prof = await getProfile(u.uid) || {};
  const firstName = prof.firstName || (state.customer.name || "").split(" ")[0] || "Champ";
  $("#cust-greeting").textContent = `Hey ${firstName}!`;
  $("#cust-email").textContent = u.email;

  const orders = await loadOrdersForUser(u.uid !== "guest" ? u.uid : u.email) || [];
  orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Pint-Spar-Zähler: total saved CHF across PAID orders
  const paid = orders.filter(o => o.paymentStatus === "bezahlt");
  const totalSaved = paid.reduce((s, o) => s + (o?.pricing?.totalDiscount || 0), 0);
  const support    = orders.reduce((s, o) => s + (o?.pricing?.grandTotal || 0), 0);
  const freePints  = savingsToPints(totalSaved);

  $("#cust-stat-count").textContent   = orders.length;
  $("#cust-stat-support").textContent = fmt(support);
  $("#cust-stat-savings").textContent = `${totalSaved.toFixed(2)} CHF`;
  $("#cust-stat-pints").textContent   = `${freePints.toFixed(2)} Gratis-Pints 🍦`;

  // Referral code + bonus
  const refCode = prof.refCode || "—";
  $("#cust-refcode").textContent = refCode;
  const bonus = Number(prof.referralBonusPercent || u.referralBonusPercent || 0);
  $("#cust-bonus").innerHTML = bonus > 0
    ? `🎉 Dein Buddy-Bonus: <strong>${bonus}%</strong> auf deine nächste Bestellung wartet!`
    : `Lade Freunde ein — sobald sie mit deinem Code bezahlen, gibt's <strong>5%</strong> für dich obendrauf!`;

  // List orders
  if (!orders.length) {
    show("#cust-empty"); hide("#cust-list"); return;
  }
  hide("#cust-empty"); show("#cust-list");
  $("#cust-list").innerHTML = orders.map(o => {
    const d = new Date(o.timestamp);
    const dStr = d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const items = [];
    if (o.qty?.chocolate) items.push(`${o.qty.chocolate}× Chocolate`);
    if (o.qty?.vanilla)   items.push(`${o.qty.vanilla}× Vanilla`);
    if (o.qty?.caramel)   items.push(`${o.qty.caramel}× Caramel`);
    const st = o.paymentStatus || "zahlung_ausstehend";
    const pendingPay = st === "zahlung_ausstehend" || st === "offen";
    const isFinal = st === "abgeschlossen";
    return `<div class="rounded-2xl bg-white border border-espresso/8 p-4 shadow-soft">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-widest text-espresso/55">${dStr}</div>
          <div class="font-display text-base font-semibold mt-0.5">${o.id}</div>
          <div class="text-xs text-espresso/65 mt-1">${items.join(" · ") || "—"}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-display text-lg font-semibold">${(o.pricing?.grandTotal || 0).toFixed(2)} CHF</div>
          <div class="mt-1 status-pill status-${st.replace(/_/g, "-")}">${STATUS_LABELS[st] || st}</div>
        </div>
      </div>
      <div class="flex gap-2 mt-3">
        <button class="flex-1 rounded-xl border border-espresso/15 py-2.5 px-3 text-xs font-medium flex items-center justify-center gap-2 reorder-btn" data-id="${o.id}">
          <i data-lucide="rotate-ccw" class="w-4 h-4"></i> Nochmal bestellen
        </button>
        ${pendingPay ? `<button class="flex-1 rounded-xl btn-twint py-2.5 px-3 text-xs font-medium flex items-center justify-center gap-2 repay-btn" data-id="${o.id}"><span class="twint-mark"></span> Jetzt bezahlen</button>` : ""}
      </div>
      ${isFinal ? `
      <div class="mt-3 pt-3 border-t border-espresso/8">
        <p class="text-[11px] text-espresso/55 mb-1">Wie hat dir der Bestellprozess gefallen?</p>
        <div class="flex gap-2">
          <input class="input flex-1 fb-text" data-id="${o.id}" placeholder="Dein ehrliches Feedback..."/>
          <button class="px-3 rounded-xl btn-berry text-sm font-medium fb-submit" data-id="${o.id}">Senden</button>
        </div>
      </div>` : ""}
    </div>`;
  }).join("");

  $$(".reorder-btn").forEach(b => b.addEventListener("click", () => reorder(b.dataset.id, orders)));
  $$(".repay-btn").forEach(b => b.addEventListener("click", () => repay(b.dataset.id, orders)));
  $$(".fb-submit").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.id;
    const txt = document.querySelector(`.fb-text[data-id="${id}"]`)?.value || "";
    if (!txt.trim()) return;
    await submitFeedback({ orderId: id, email: u.email, text: txt });
    b.outerHTML = `<span class="text-xs text-berry font-medium">Merci 💜</span>`;
  }));

  // Sharing
  $("#share-whatsapp")?.addEventListener("click", () => shareOn("whatsapp", refCode), { once: true });
  $("#share-instagram")?.addEventListener("click", () => shareOn("instagram", refCode), { once: true });
  $("#cust-copy-code")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(refCode); } catch {}
    $("#cust-copy-label").textContent = "Kopiert ✓";
    setTimeout(() => { $("#cust-copy-label").textContent = "Kopieren"; }, 1600);
  }, { once: true });
}

function shareTextFor(code) {
  const url = `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(code)}`;
  return `Hey! Gönn dir mal das High-Protein Eis von Berry's Delights. Über meinen Link kriegst du direkt 5% Extra-Rabatt auf deine erste Bestellung: ${url} 🍦💪`;
}
async function shareOn(platform, code) {
  if (!code || code === "—") return;
  const text = shareTextFor(code);
  if (platform === "whatsapp") {
    window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(text), "_blank");
  } else if (platform === "instagram") {
    try { await navigator.clipboard.writeText(text); toast("✓ Text kopiert! Jetzt in Instagram einfügen.", { color: "#25D366" }); }
    catch { toast("Konnte Text nicht kopieren — Browser blockt Clipboard.", { color: "#8B1A3B" }); }
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = "instagram://"; a.style.display = "none";
      document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 100);
    }, 300);
  }
}

async function reorder(id, orders) {
  const o = orders.find(x => x.id === id); if (!o) return;
  state.qty.chocolate += o.qty?.chocolate || 0;
  state.qty.vanilla   += o.qty?.vanilla   || 0;
  state.qty.caramel   += o.qty?.caramel   || 0;
  saveCart();
  hide("#cust-portal"); document.body.style.overflow = "";
  renderAll(); openCart();
}
async function repay(id, orders) {
  const o = orders.find(x => x.id === id); if (!o) return;
  const amount = (o.pricing?.grandTotal || 0).toFixed(2);
  const ok = confirm(`TWINT wird geöffnet.\n\nBitte ${amount} CHF an ${MERCHANT_TWINT} überweisen.\n\nFortfahren?`);
  if (!ok) return;
  openTwintApp();
}

// Account icon dot when logged in
function setAccountDot() { $("#account-dot")?.classList.toggle("hidden", !currentUser()); }

// ════════════════════════════════════════════════════════════════
// LIVE USER COUNTER (>= 3)
// ════════════════════════════════════════════════════════════════
function startLiveCounter() {
  startPresence((count) => {
    const el = $("#live-users");
    if (!el) return;
    if (typeof count === "number" && count >= 3) {
      el.classList.remove("hidden");
      $("#live-users-count").textContent = count;
    } else {
      el.classList.add("hidden");
    }
  });
}

// ════════════════════════════════════════════════════════════════
// QR CODE (admin section)
// ════════════════════════════════════════════════════════════════
function renderQR() {
  const wrap = $("#qrcode"); if (!wrap || !window.QRCode) return;
  wrap.innerHTML = "";
  const url = window.location.href;
  new window.QRCode(wrap, { text: url, width: 180, height: 180, colorDark: "#1A0E10", colorLight: "#FFFFFF" });
  $("#qr-url").textContent = url;
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
loadCart();

initAuth();
onAuthChange((u) => { setAccountDot(); renderAll(); });

renderFlavors();
renderAll();
hydrateForm();
bindReferralUI(renderAll);
bindAdminUI();

// URL-based actions
handleRefURLParam();           // ?ref=CODE
verifyFromURL();               // ?verify=...&token=...

// Detail/admin teardown
const qrDetails = document.querySelector("details");
qrDetails?.addEventListener("toggle", () => { if (qrDetails.open) renderQR(); });
if (window.QRCode) renderQR();

// Session tracking + live counter
startSessionTracking();
startLiveCounter();

refreshIcons();

// Surface backend mode for transparency in console
console.info(`[Berry's Delights] Modus: ${FB_READY ? "CLOUD (Firebase)" : "LOCAL (nur dieses Gerät)"}`);
