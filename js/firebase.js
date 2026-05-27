// /js/firebase.js
// Single source of truth for Firebase initialization.
// Imports Firebase v10+ modular SDK directly from Google's CDN as ES modules.
//
// HOW TO ACTIVATE: paste your real keys into firebaseConfig below.
// While the placeholders are present, the whole app runs in LOCAL mode
// (localStorage fallback for cart, orders, accounts) — perfect for testing.
// As soon as a real apiKey is detected, cloud sync activates everywhere.

import { initializeApp, getApps }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, get, push, remove,
         serverTimestamp, onDisconnect, runTransaction, query, orderByChild, equalTo }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

// ─────────────────────────────────────────────────────────────────────
// Paste your config from Firebase Console -> Project Settings -> "Your apps"
// ─────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey:            "HIER_MEIN_API_KEY",
  authDomain:        "HIER_MEINE_AUTH_DOMAIN",
  databaseURL:       "HIER_MEINE_DATABASE_URL",
  projectId:         "HIER_MEIN_PROJECT_ID",
  storageBucket:     "HIER_MEIN_STORAGE_BUCKET",
  messagingSenderId: "HIER_MEIN_MESSAGING_SENDER_ID",
  appId:             "HIER_MEIN_APP_ID"
};

// Cloud mode active only when real keys are provided
export const FB_READY = !!firebaseConfig.apiKey
  && !firebaseConfig.apiKey.startsWith("HIER_")
  && !!firebaseConfig.databaseURL
  && !firebaseConfig.databaseURL.startsWith("HIER_");

export let app  = null;
export let auth = null;
export let db   = null;

if (FB_READY) {
  try {
    app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getDatabase(app);
    // Make sessions survive reloads & browser restarts
    setPersistence(auth, browserLocalPersistence).catch((e) => console.warn("[fb] persistence:", e));
    console.info("[Berry's Delights] Firebase Cloud aktiv ✓");
  } catch (e) {
    console.error("[Berry's Delights] Firebase init fehlgeschlagen:", e);
  }
} else {
  console.info("[Berry's Delights] Firebase nicht konfiguriert — läuft im LOCAL-Modus.");
}

// Re-export commonly used RTDB helpers so other modules only import from here
export { ref, onValue, set, update, get, push, remove,
         serverTimestamp, onDisconnect, runTransaction, query, orderByChild, equalTo };

// Admin identification — single source of truth used by rules + UI
export const ADMIN_EMAIL = "beer.lucas@hotmail.com";
