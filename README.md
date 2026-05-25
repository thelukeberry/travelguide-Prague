# Persönliche Finanz-App (PSD2 / GoCardless Bank Account Data)

Lokale, selbst gehostete Finanz-App. Verbindet deine echten Bankkonten über
[GoCardless Bank Account Data](https://bankaccountdata.gocardless.com/) (PSD2,
ehemals Nordigen), zieht Salden und Transaktionen automatisch, kategorisiert sie
über editierbare Keyword-Regeln und zeigt alles in einem ruhigen Dashboard an.

Single-User-App. Secrets liegen ausschließlich im Backend.

## Architektur

- **Backend:** Node.js + Express + TypeScript, SQLite über `better-sqlite3`,
  Scheduler via `node-cron`. Spricht als einziger Client mit GoCardless.
- **Frontend:** React + Vite + TypeScript, Charts mit `recharts`, Icons via
  `lucide-react`. Spricht nur mit dem eigenen Backend.
- **Datenbank:** Eine einzelne SQLite-Datei (Standard: `./data/finance.db`).

```
/server   → Express-API, GoCardless-Client, Sync-Logik, Cron-Job
/client   → React-Dashboard inkl. Connect-Flow
/.env     → Secrets (nicht eingecheckt)
```

## Setup

### 1. Voraussetzungen

- Node.js ≥ 18 (empfohlen: 20+)
- npm
- Ein Account im [GoCardless Bank Account Data Portal](https://bankaccountdata.gocardless.com/)
  mit erstelltem **Secret-Pair** (`SECRET_ID` + `SECRET_KEY`).

### 2. Dependencies installieren

Im Repo-Root:

```bash
npm run install:all
```

Das installiert Root, Server und Client in einem Schritt.

### 3. `.env` anlegen

Kopiere die Vorlage und trage deine Secrets ein:

```bash
cp .env.example .env
```

Wichtige Einträge:

| Variable | Bedeutung |
|----------|-----------|
| `SECRET_ID`, `SECRET_KEY` | GoCardless Bank Account Data Credentials |
| `PORT` | Backend-Port (Default 3001) |
| `DATABASE_FILE` | Pfad zur SQLite-Datei (Default `./data/finance.db`) |
| `REDIRECT_URI` | Rücksprung-URL für die Bank (`http://localhost:5173/callback` in Dev) |
| `CLIENT_ORIGIN` | Erlaubter CORS-Origin |
| `SYNC_CRON` | Cron-Pattern für den Hintergrund-Sync, Default `0 7,19 * * *` (2× täglich) |
| `API_TOKEN` | Optionaler Header-Token. Wenn gesetzt, muss jeder API-Aufruf den Header `x-api-token: <wert>` schicken. Lass leer für rein lokalen Betrieb. |
| `DEFAULT_COUNTRY` | Standardland (ISO 3166-1, Default `de`) |

### 4. Start

```bash
npm run dev
```

- Backend läuft auf `http://localhost:3001`
- Frontend auf `http://localhost:5173`
- Die Vite-Devserver-Konfig leitet `/api/*` ans Backend weiter.

Health-Check: `curl http://localhost:3001/health`.

## Sandbox-Test zuerst!

Bevor du eine echte Bank verknüpfst, teste den Flow gegen die GoCardless-Sandbox.

### Variante A — CLI

```bash
npm --prefix server run test:sandbox
```

Das Skript prüft Schritt für Schritt:

1. Access-Token holen
2. Banken auflisten
3. End-User-Agreement anlegen (`SANDBOXFINANCE_SFIN0000`)
4. Requisition erzeugen + Link ausgeben

Öffne den Link im Browser, autorisiere die Sandbox-Bank, du landest auf der
Callback-Seite und siehst „Erfolgreich verbunden". Konten + Transaktionen
erscheinen im Dashboard nach kurzer Zeit.

### Variante B — über die UI

1. App starten (`npm run dev`).
2. „Bank verbinden" → Land Deutschland → nach `Sandbox` suchen.
3. Auf „Sandbox Finance" klicken → wirst zur Auth umgeleitet.
4. Sandbox-Login (im GoCardless-Portal dokumentierte Test-Credentials).
5. Du landest auf `/callback` und siehst Status `Erfolgreich verbunden`.
6. Zurück zum Dashboard: Konten, Salden und Transaktionen sind da.

Erst danach mit einer echten Bank wiederholen.

## So funktioniert der Connect-Flow

```
Bankliste                 (GET  /institutions/?country=de)
   ↓
Agreement                 (POST /agreements/enduser/)
   ↓
Requisition               (POST /requisitions/)
   ↓
Bank-Login / SCA          (Bank redirected zu REDIRECT_URI)
   ↓
Konten abholen            (GET  /requisitions/<id>/  → accounts[])
   ↓
Details + Salden + Tx     (GET  /accounts/<id>/{details,balances,transactions}/)
```

Auth-Tokens werden zentral vom `TokenManager` verwaltet:

- 24h-Access-Token wird im Speicher gecached.
- Vor Ablauf wird automatisch via Refresh-Token erneuert.
- Bei 401-Antworten wird einmalig neu authentifiziert.

## Rate-Limits & Reauth

- Banken erlauben über GoCardless oft nur **~4 Abrufe pro Konto und Endpoint
  pro Tag**. Der Cron läuft deshalb standardmäßig nur **2× täglich**
  (`0 7,19 * * *`). HTTP `429` wird abgefangen und im Sync-Log vermerkt.
- PSD2 begrenzt den unbeaufsichtigten Zugriff auf **90 Tage**. Danach steht die
  Verbindung auf `EX` (expired). Im Dashboard erscheint ein roter Banner mit
  Button „Bank neu verbinden", der den Flow ab Schritt 3 (Agreement) wiederholt.

## Datenmodell (SQLite)

- `connections` — eine pro Bank (institution_id, requisition_id, agreement_id, status, expires_at, …)
- `accounts` — eine pro Konto (balance, balance_type, last_synced_at, …)
- `transactions` — eine pro Buchung; `UNIQUE(account_id, external_id)` verhindert Duplikate beim Resync
- `category_rules` — Keyword→Kategorie (editierbar via API, siehe unten)
- `settings` — z. B. Standardwährung
- `sync_log` — protokolliert jeden Sync-Lauf

### Annahme: Welcher `balance_type` zählt als „Kontostand"?

GoCardless gibt mehrere Balance-Typen pro Konto zurück. Wir nehmen den ersten,
der existiert, in dieser Reihenfolge:

1. `interimAvailable`
2. `expected`
3. `closingBooked`
4. `interimBooked`
5. sonst das erste verfügbare

Das ist der typische „verfügbare" Kontostand. Wenn deine Bank etwas anderes
liefert (manche Sparkassen z. B. nutzen `closingBooked`), passe die Reihenfolge
in `server/src/sync.ts` (`pickBalance`) an.

## Kategorisierung

Regelbasiert. Beim Sync wird jeder Transaktion eine Kategorie zugewiesen, indem
der Verwendungszweck + Gegenpartei-Name nach Keywords aus `category_rules`
durchsucht wird (höhere `priority` gewinnt).

### Regeln erweitern

Per API:

```bash
# alle Regeln
curl http://localhost:3001/api/categories/rules

# neue Regel
curl -X POST http://localhost:3001/api/categories/rules \
  -H "content-type: application/json" \
  -d '{"keyword":"netflix","category":"Abos","priority":60}'

# löschen
curl -X DELETE http://localhost:3001/api/categories/rules/<id>
```

Oder direkt in der DB:

```bash
sqlite3 data/finance.db \
  "INSERT INTO category_rules (keyword, category, priority) VALUES ('idealo', 'Sonstiges', 50);"
```

Beim nächsten Sync werden **neue** Transaktionen damit kategorisiert. Schon
vorhandene Transaktionen werden beim Re-Sync aktualisiert, wenn die Bank dieselbe
`transactionId` erneut liefert. Möchtest du alles neu kategorisieren, lösche die
DB-Datei (Verbindungen + Konten müssen neu verknüpft werden) — oder erweitere
`syncAccount` um einen Recategorize-Pass.

### Abo-Erkennung

Aggregiert auf SQL-Ebene: gleiche `counterparty` + ungefähr gleicher Betrag in
≥ 2 verschiedenen Monaten der letzten 6 Monate → erscheint im Tab „Abos" und in
„anstehende Abo-Zahlungen" auf der Übersicht.

## Cron-Zeitplan ändern

In `.env`:

```env
SYNC_CRON=0 7,19 * * *   # Default: 07:00 + 19:00 lokal
```

Format ist Standard-Cron (5 Felder). Beispiele:

- `0 6 * * *` — täglich 06:00
- `*/30 * * * *` — alle 30 Minuten (Achtung Rate-Limit!)
- Ungültiges Pattern → der Job startet nicht, Warnung im Log.

Manuell anstoßen: Button „Jetzt synchronisieren" im Dashboard oder
`POST /api/sync` (optional `{ "account_id": "..." }` für einzelnes Konto).

## Sicherheit

- Secrets liegen in `.env`, das via `.gitignore` aus dem Repo gehalten wird.
- Das Frontend spricht **nie** direkt mit GoCardless – alle Calls laufen über
  `/api/*` am Backend.
- `transactions.raw_json` enthält die komplette GoCardless-Antwort (für
  Debugging); die API gibt aber nur die nötigen Felder zurück.
- Falls du die App ins Internet stellst: setze `API_TOKEN` in `.env`. Das
  Backend erzwingt dann den Header `x-api-token` auf allen `/api/*` Routen
  (lokales Frontend musst du dann patchen, damit es den Token mitsendet).
- WAL-Mode ist aktiv, Foreign Keys werden erzwungen. Backup ist ein simples
  `cp data/finance.db ...`.

## API-Übersicht

| Methode | Pfad | Zweck |
|--------:|------|-------|
| GET    | `/api/institutions?country=de` | Banken auflisten |
| POST   | `/api/connect` `{ institution_id, institution_name }` | Agreement + Requisition anlegen, gibt `link` zur Bank zurück |
| GET    | `/api/connect/callback?requisition_id=…` (oder `?ref=…`) | Nach SCA-Rückkehr: Konten holen, speichern, initial syncen |
| POST   | `/api/sync` `{ account_id? }` | Sync manuell anstoßen |
| GET    | `/api/accounts` | Konten + Salden + Status |
| GET    | `/api/connections` | Banken-Verbindungen + Ablaufdaten |
| GET    | `/api/transactions?from=&to=&category=&account_id=&limit=` | Gefilterte Transaktionen |
| GET    | `/api/summary` | Netto-Vermögen, Monatsaggregat, 6-Monats-Historie, Abos, letzte Tx |
| DELETE | `/api/connections/:id` | Verbindung trennen (lokal + bei GoCardless) |
| GET / POST / DELETE | `/api/categories/rules[/:id]` | Kategorie-Regeln verwalten |

## Hinweise für echte Banken

- **SCA (Strong Customer Authentication)** kann TAN, App-Bestätigung oder
  Foto-TAN bedeuten. Wenn die Bank die Auth verweigert, landest du auf
  `/callback` mit Status `RJ` oder gar `EX`.
- Manche Banken liefern leere `transactionId` — der Sync nutzt dann
  `internalTransactionId` oder einen deterministischen Fallback-Key
  (`status-date-amount-index`) zum Deduplizieren. Falls deine Bank wirklich
  identische Buchungen am selben Tag ohne ID liefert, kann das zu Verlust einer
  echten Doppelbuchung führen — passe die `externalIdOf`-Funktion in
  `server/src/sync.ts` an deine Bank an, wenn das relevant wird.
- Verwendungszweck heißt manchmal `remittanceInformationUnstructured` (Array),
  nicht nur ein einzelner String. Beides wird gehandhabt.

## Production Build

```bash
npm run build
NODE_ENV=production npm --prefix server run start
```

Anschließend kannst du den `client/dist/`-Output mit einem statischen Server
(z. B. nginx, Caddy) ausliefern und das Backend hinter einen Reverse-Proxy
hängen.

## Lizenz

Privatprojekt. Mach damit, was du willst.
