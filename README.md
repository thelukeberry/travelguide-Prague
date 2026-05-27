# Berry's Delights — Premium High Protein Ice Cream

Mobile-first Bestell-Website mit Kundenkonten, Win-Win-Referral (5%+5%),
Admin-Backoffice mit Statistik-Zentrale, Feedback-Schleife, TWINT-Workflow
und optionaler Cloud-Synchronisation via Firebase.

## Struktur

```
.
├── index.html              Minimaler HTML/CSS-Shell, lädt nur /js/app.js
├── js/
│   ├── firebase.js         Firebase-Init + Konfig (Realtime DB + Auth)
│   ├── ui.js               DOM-Helper, Toasts, Validatoren (CH-Phone etc.)
│   ├── cart.js             Cart-State + Pricing-Engine + Persistenz
│   ├── referral.js         Buddy-Codes, Rate-Limit, Honeypot, ?ref auto-apply
│   ├── auth.js             Registrierung, Login, Profile, Email-Verify
│   ├── orders.js           Orders, Status-Workflow, Feedback, Presence
│   ├── admin.js            Backoffice + Statistik-Zentrale
│   └── app.js              Entry-Point (wired up by <script type="module">)
├── database.rules.json     Restriktive Firebase Realtime DB Security Rules
└── README.md
```

## Cloud aktivieren (10 Min)

1. https://console.firebase.google.com → neues Projekt
2. **Build → Authentication → Email/Password aktivieren**
3. **Build → Realtime Database → Database erstellen** (Region `europe-west1`)
4. **Realtime Database → Tab "Rules"** → Inhalt von `database.rules.json` einfügen → Publish
5. **Project Settings → Your apps → Web (</>) → registrieren**
6. Konfig-Objekt kopieren und in `/js/firebase.js` einfügen (Felder `HIER_*` ersetzen)
7. Deploy — ab sofort Cloud-Sync (Cross-Device, Live-Counter, echte E-Mail-Verify)

## Lokaler Modus (sofort einsatzbereit, ohne Setup)

Solange die `HIER_*`-Platzhalter in `/js/firebase.js` stehen, läuft alles
lokal über `localStorage`. Perfekt für Tests — aber keine geräteübergreifende
Bestellansicht und keine echte Verifikationsmail (manueller Link wird im UI
angezeigt).

## Test lokal

ES-Module brauchen `http://` (kein Doppelklick auf die Datei):

```bash
python3 -m http.server 8000
# http://localhost:8000 öffnen
```

## Admin-Login

E-Mail: `beer.lucas@hotmail.com` · Passwort: `LuBe25031997.`
