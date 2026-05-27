// /js/cart.js
// Cart state, pricing engine, localStorage persistence.
// Discount tiers (per flavor, additive): 5×=5%, 10×=10%, optional referral 5%.

export const PRICE = 12.00;
export const PROTEIN_PER_PINT = 45; // grams per pint (45–52g claim — using 45 as floor)
export const REFERRAL_PCT     = 5;  // referred customer gets 5%, referrer earns 5% on next order

const CART_KEY = "bd_cart_v1";

export const FLAVORS = [
  { id: "chocolate", name: "Chocolate Fudge Brownie", tagline: "Dunkel · Brownie-Stücke",  gradient: "grad-chocolate", labelColor: "#1A0E10" },
  { id: "vanilla",   name: "Vanilla Cookie Dough",    tagline: "Cremig · Cookie-Bites",     gradient: "grad-vanilla",   labelColor: "#1A0E10" },
  { id: "caramel",   name: "Salted Caramel Toffee",   tagline: "Butterig · Fleur de Sel",   gradient: "grad-caramel",   labelColor: "#FAF6EF" },
];

// Single canonical state object — read & mutated by other modules
export const state = {
  qty:       { chocolate: 0, vanilla: 0, caramel: 0 },
  referral:  null,            // { code, percent, ownerUid? }
  tip:       { type: "percent", value: 0 },
  customer:  { name: "", email: "", phone: "", notes: "" },
};

let _hydrating = false;

export function saveCart() {
  if (_hydrating) return;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({
      qty: state.qty,
      referral: state.referral,
      tip: state.tip,
      customer: state.customer,
    }));
  } catch {}
}

export function loadCart() {
  _hydrating = true;
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.qty)      Object.assign(state.qty, d.qty);
      if ("referral" in d) state.referral = d.referral || null;
      if (d.tip)      state.tip = d.tip;
      if (d.customer) state.customer = Object.assign({ notes: "" }, d.customer);
    }
  } catch {}
  _hydrating = false;
}

export function clearCartItems() {
  state.qty = { chocolate: 0, vanilla: 0, caramel: 0 };
  state.referral = null;
  state.tip = { type: "percent", value: 0 };
  // Keep state.customer.* so repeat orders don't require re-typing
  saveCart();
}

// ──────────────────────────────────────────────────────────────────
// Pricing — per-flavor only (greedy is provably optimal here).
//   floor(qty / 10) × 10-pack at 10%
//   floor((qty - 10·tens) / 5) × 5-pack at 5%
//   remainder at full price
// Referral discount (5%) applies additively on TOTAL subtotal when active.
// ──────────────────────────────────────────────────────────────────
export function priceCart() {
  const ids = ["chocolate", "vanilla", "caramel"];
  const totalItems = ids.reduce((s, id) => s + (state.qty[id] || 0), 0);
  const subtotal   = totalItems * PRICE;

  const packs = {};
  let tens = 0, fives = 0;
  for (const id of ids) {
    const n = state.qty[id] || 0;
    const t = Math.floor(n / 10);
    const f = Math.floor((n - 10 * t) / 5);
    packs[id] = { tens: t, fives: f };
    tens  += t;
    fives += f;
  }

  const tenDiscount   = tens  * 10 * PRICE * 0.10;
  const fiveDiscount  = fives *  5 * PRICE * 0.05;
  const refPct        = state.referral ? (state.referral.percent / 100) : 0;
  const refDiscount   = subtotal * refPct;
  const totalDiscount = tenDiscount + fiveDiscount + refDiscount;
  const afterDiscount = Math.max(0, subtotal - totalDiscount);

  let tipAmount = 0;
  if (state.tip.type === "percent")    tipAmount = afterDiscount * (state.tip.value / 100);
  else if (state.tip.type === "fixed") tipAmount = Math.max(0, Number(state.tip.value) || 0);

  const grandTotal = afterDiscount + tipAmount;

  return {
    subtotal, totalDiscount, afterDiscount, tipAmount, grandTotal,
    tens, fives, packs,
    tenDiscount, fiveDiscount, refDiscount,
    totalItems,
    proteinG: totalItems * PROTEIN_PER_PINT,
  };
}

// Pint-Spar-Zähler — used in customer portal
// Sum of total discounts across all this user's PAID orders, in "free pints"
export function savingsToPints(savedCHF) {
  return savedCHF / PRICE;
}
