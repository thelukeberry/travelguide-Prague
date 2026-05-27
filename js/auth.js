// /js/auth.js
// Customer + admin authentication. Cloud (Firebase Auth + RTDB user profile)
// when configured, transparent localStorage fallback when not.

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { FB_READY, auth, db, ref, set, get, update, ADMIN_EMAIL } from "./firebase.js";
import { reserveCode } from "./referral.js";
import { isEmailValid, ERR } from "./ui.js";

// Local fallback storage
const L_USERS   = "bd_users_local_v1";
const L_SESSION = "bd_session_local_v1";

const _listeners = new Set();

// Public: subscribe to auth changes. Callback fires with user or null.
export function onAuthChange(cb) { _listeners.add(cb); return () => _listeners.delete(cb); }
function emit(user) { _listeners.forEach(fn => { try { fn(user); } catch (e) { console.warn(e); } }); }

// Best-effort sync getter (Firebase keeps currentUser in memory)
export function currentUser() {
  if (FB_READY && auth) {
    const u = auth.currentUser;
    if (!u) return null;
    return wrapUser(u.uid, u.email, !!u.emailVerified);
  }
  return localCurrent();
}

function wrapUser(uid, email, verified) {
  if (!email) return null;
  return {
    uid, email,
    verified,
    firstName: "",
    refCode: null,
    referralBonusPercent: 0,
    isAdmin: email.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  };
}

export async function initAuth() {
  if (FB_READY && auth) {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return emit(null);
      const wrapped = wrapUser(u.uid, u.email, !!u.emailVerified);
      // Enrich from RTDB profile (firstName, refCode, referralBonusPercent)
      try {
        const snap = await get(ref(db, `users/${u.uid}`));
        if (snap.exists()) Object.assign(wrapped, snap.val());
      } catch {}
      // Hard-block admin role escalation: enforce by email only
      wrapped.isAdmin = wrapped.email && wrapped.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      emit(wrapped);
    });
  } else {
    // Local mode: emit once after tick
    setTimeout(() => emit(localCurrent()), 0);
  }
}

// ──────────────────────────────────────────────────────────────────
// Registration
// ──────────────────────────────────────────────────────────────────
export async function registerCustomer({ email, password, passwordConfirm, firstName }) {
  email = String(email || "").trim().toLowerCase();
  if (!isEmailValid(email))         throw new Error(ERR.emailFormat);
  if (!password || password.length < 8) throw new Error(ERR.passwordWeak);
  if (password !== passwordConfirm) throw new Error(ERR.passwordsDiffer);
  firstName = String(firstName || "").trim();

  if (FB_READY && auth) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const refCode = await reserveCode(firstName || email.split("@")[0], uid, email);
    await set(ref(db, `users/${uid}`), {
      email, firstName, refCode,
      referralBonusPercent: 0,        // accumulated 5%-credits owed on next order
      role: "customer",               // server rules enforce this; only admin email gets admin powers
      createdAt: Date.now(),
    });
    await sendEmailVerification(cred.user, {
      url: window.location.origin + window.location.pathname,
    });
    await signOut(auth);
    return { ok: true, verifyEmailSent: true, manualLink: null };
  }

  // Local fallback
  const users = loadLocal();
  if (users[email]) throw new Error("Diese E-Mail ist schon registriert. Logg dich ein!");
  const refCode = await reserveCode(firstName || email.split("@")[0], "local:" + email, email);
  const verifyToken = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random());
  users[email] = {
    email, firstName,
    refCode, referralBonusPercent: 0,
    passwordHash: await sha256(password),
    verified: false, verifyToken,
    createdAt: Date.now(),
  };
  saveLocal(users);
  const manualLink = `${window.location.origin}${window.location.pathname}?verify=${encodeURIComponent(email)}&token=${encodeURIComponent(verifyToken)}`;
  return { ok: true, verifyEmailSent: false, manualLink };
}

// ──────────────────────────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────────────────────────
export async function loginCustomer({ email, password }) {
  email = String(email || "").trim().toLowerCase();
  if (!isEmailValid(email)) throw new Error(ERR.emailFormat);

  if (FB_READY && auth) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!cred.user.emailVerified) {
      const err = new Error("Konto noch nicht bestätigt. Check dein Postfach (auch Spam!).");
      err.code = "NOT_VERIFIED";
      await signOut(auth);
      throw err;
    }
    return { uid: cred.user.uid, email: cred.user.email };
  }

  const users = loadLocal();
  const u = users[email];
  if (!u) { const e = new Error("Kein Konto mit dieser E-Mail. Erst registrieren!"); e.code = "NO_USER"; throw e; }
  const hash = await sha256(password);
  if (hash !== u.passwordHash) { const e = new Error("Passwort falsch. Nochmal sauber tippen."); e.code = "BAD_PASS"; throw e; }
  if (!u.verified) { const e = new Error("Konto noch nicht bestätigt. Bestätigungslink klicken!"); e.code = "NOT_VERIFIED"; throw e; }
  localStorage.setItem(L_SESSION, email);
  emit(localCurrent());
  return { uid: "local:" + email, email };
}

export async function logoutCustomer() {
  if (FB_READY && auth) { try { await signOut(auth); } catch {} }
  localStorage.removeItem(L_SESSION);
  emit(null);
}

// Local-mode email verification via URL token
export function verifyFromURL() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("verify"), token = params.get("token");
  if (!email || !token) return null;
  // Cloud mode: Firebase handles its own action URL flow, no-op here
  if (FB_READY) {
    // Clean URL anyway
    params.delete("verify"); params.delete("token");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    return null;
  }
  const e = String(email).trim().toLowerCase();
  const users = loadLocal();
  const u = users[e];
  if (!u) return { ok: false };
  if (!u.verified && u.verifyToken === token) {
    u.verified = true; delete u.verifyToken;
    users[e] = u; saveLocal(users);
  }
  params.delete("verify"); params.delete("token");
  const qs = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
  return { ok: !!u.verified, email: e };
}

// ──────────────────────────────────────────────────────────────────
// Profile + referral bonus credit management
// ──────────────────────────────────────────────────────────────────
export async function getProfile(uid) {
  if (FB_READY && db && uid && !String(uid).startsWith("local:")) {
    try { const snap = await get(ref(db, `users/${uid}`)); return snap.val() || null; }
    catch { return null; }
  }
  const email = String(uid || "").replace(/^local:/, "");
  const u = loadLocal()[email];
  return u ? { email: u.email, firstName: u.firstName, refCode: u.refCode, referralBonusPercent: u.referralBonusPercent || 0 } : null;
}

/** Add or subtract a referral bonus on a user. Called from orders.js when admin
 *  marks a referred order as 'bezahlt' (add) or rolls back (clear after use). */
export async function adjustReferralBonus(uid, deltaPct) {
  if (FB_READY && db && uid && !String(uid).startsWith("local:")) {
    try {
      const snap = await get(ref(db, `users/${uid}/referralBonusPercent`));
      const cur  = Number(snap.val()) || 0;
      await update(ref(db, `users/${uid}`), { referralBonusPercent: Math.max(0, cur + deltaPct) });
    } catch (e) { console.warn("[auth] adjustReferralBonus failed", e); }
    return;
  }
  const email = String(uid || "").replace(/^local:/, "");
  const users = loadLocal();
  if (!users[email]) return;
  users[email].referralBonusPercent = Math.max(0, (Number(users[email].referralBonusPercent) || 0) + deltaPct);
  saveLocal(users);
}

// ── helpers
function loadLocal()      { try { return JSON.parse(localStorage.getItem(L_USERS)) || {}; } catch { return {}; } }
function saveLocal(map)   { try { localStorage.setItem(L_USERS, JSON.stringify(map)); } catch {} }
function localCurrent()   {
  const email = localStorage.getItem(L_SESSION);
  if (!email) return null;
  const u = loadLocal()[email];
  if (!u || !u.verified) return null;
  return {
    uid: "local:" + email,
    email, firstName: u.firstName || "",
    verified: true,
    refCode: u.refCode || null,
    referralBonusPercent: u.referralBonusPercent || 0,
    isAdmin: email.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  };
}

async function sha256(str) {
  const enc = new TextEncoder().encode(str + "bd_salt_v1_change_for_prod");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
