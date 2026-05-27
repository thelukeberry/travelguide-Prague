// /js/ui.js
// DOM helpers, toasts, German-language validators (email + Swiss phone + anti-zahlenleiter).

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const fmt = (n) => `${(Number(n) || 0).toFixed(2)} CHF`;

export function show(el)    { if (typeof el === "string") el = $(el); el && el.classList.remove("hidden"); }
export function hide(el)    { if (typeof el === "string") el = $(el); el && el.classList.add("hidden"); }
export function toggle(el, visible) {
  if (typeof el === "string") el = $(el);
  if (el) el.classList.toggle("hidden", !visible);
}

// Small toast at top — auto-fades
export function toast(html, { color = "#1A0E10", ms = 2400 } = {}) {
  const t = document.createElement("div");
  t.className = "fixed top-0 inset-x-0 z-[300] text-cream px-4 py-3 text-sm text-center shadow-soft";
  t.style.background = color;
  t.innerHTML = html;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Safe icon refresh (Lucide may be late / blocked)
export function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    try { window.lucide.createIcons(); } catch {}
  }
}

// ──────────────────────────────────────────────────────────────────
// VALIDATORS — alle Meldungen auf Deutsch im Gym-Buddy-Stil
// ──────────────────────────────────────────────────────────────────
export const ERR = {
  emailEmpty:   "Halt, ohne E-Mail kommen wir nicht weiter! 📩",
  emailFormat:  "Diese E-Mail sieht nicht echt aus — bitte nochmal checken. 📩",
  phoneFormat:  "Bitte gib eine gültige Mobilnummer für den TWINT-Abgleich an! 📱",
  phoneFake:    "Bitte gib eine gültige Mobilnummer für den TWINT-Abgleich an! 📱",
  nameEmpty:    "Sag uns deinen Namen — sonst können wir dich nicht ansprechen. 💪",
  passwordWeak: "Passwort min. 8 Zeichen — bisschen mehr Muskeln bitte! 🔒",
  passwordsDiffer: "Die zwei Passwörter sind nicht identisch. Nochmal sauber tippen! 🔑",
};

/** Strict email syntax check (RFC-lite). */
export function isEmailValid(s) {
  s = String(s || "").trim();
  if (!s) return false;
  // No spaces, must have local@domain.tld, single @, TLD ≥ 2 chars
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s) && s.length <= 254;
}

/**
 * Clean a Swiss phone number to E.164 form +41XXXXXXXXX,
 * then format as "+41 7X XXX XX XX".
 * Returns { ok, formatted, digits, reason }.
 */
export function normalizeSwissMobile(raw) {
  let s = String(raw || "").replace(/[\s\-\(\)\.]/g, "");
  if (!s) return { ok: false, reason: ERR.phoneFormat };

  // Forms: +41XXXXXXXXX | 0041XXXXXXXXX | 0XXXXXXXXX
  if (s.startsWith("+41")) s = s.slice(3);
  else if (s.startsWith("0041")) s = s.slice(4);
  else if (s.startsWith("0")) s = s.slice(1);
  else if (/^41[7]/.test(s)) s = s.slice(2);

  // After normalization: 9 digits, starts with 7 (Swiss mobile prefix 7X)
  if (!/^7[0-9]{8}$/.test(s)) return { ok: false, reason: ERR.phoneFormat };

  // Anti-Zahnleiter / Fake-Filter
  if (isObviousFakePhone(s)) return { ok: false, reason: ERR.phoneFake };

  const digits = "+41" + s;
  const formatted = `+41 ${s.slice(0,2)} ${s.slice(2,5)} ${s.slice(5,7)} ${s.slice(7,9)}`;
  return { ok: true, formatted, digits };
}

/**
 * Detect ladders / repeats / sequential digit runs:
 *   - All same digit                       079 999 99 99
 *   - 5+ identical digits in a row         078 999 12 34
 *   - 5+ sequential ascending/descending   078 123 45 67  /  078 987 65 43
 *   - <4 unique digits (suspicious patterns)
 * `s` is the 9-digit local part after normalization (starts with 7).
 */
export function isObviousFakePhone(s) {
  if (typeof s !== "string" || s.length !== 9) return true;
  const arr = [...s].map(c => c.charCodeAt(0) - 48);

  // 1. All identical
  if (arr.every(x => x === arr[0])) return true;

  // 2. 5+ identical in a row
  let runId = 1, maxRunId = 1;
  for (let i = 1; i < arr.length; i++) {
    runId = arr[i] === arr[i-1] ? runId + 1 : 1;
    if (runId > maxRunId) maxRunId = runId;
  }
  if (maxRunId >= 5) return true;

  // 3. 5+ sequential ascending or descending (e.g. 12345, 98765)
  let runSeqUp = 1, runSeqDn = 1, maxSeq = 1;
  for (let i = 1; i < arr.length; i++) {
    runSeqUp = (arr[i] - arr[i-1] === 1) ? runSeqUp + 1 : 1;
    runSeqDn = (arr[i-1] - arr[i] === 1) ? runSeqDn + 1 : 1;
    maxSeq = Math.max(maxSeq, runSeqUp, runSeqDn);
  }
  if (maxSeq >= 5) return true;

  // 4. Too few unique digits (entropy floor)
  const uniq = new Set(arr).size;
  if (uniq < 4) return true;

  return false;
}

/** Convenience: full validate-and-format, returning either OK or an error string. */
export function validateSwissMobile(raw) {
  const r = normalizeSwissMobile(raw);
  if (!r.ok) return { ok: false, error: r.reason };
  return { ok: true, formatted: r.formatted, digits: r.digits };
}
