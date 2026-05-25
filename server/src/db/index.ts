import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from '../config';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = path.dirname(path.resolve(config.databaseFile));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(config.databaseFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  init(db);
  dbInstance = db;
  return db;
}

function init(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      requisition_id TEXT NOT NULL UNIQUE,
      agreement_id TEXT,
      reference TEXT,
      status TEXT NOT NULL,
      linked_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      iban TEXT,
      name TEXT,
      owner_name TEXT,
      currency TEXT,
      product TEXT,
      type TEXT,
      balance REAL,
      balance_type TEXT,
      balance_updated_at TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      booking_date TEXT,
      value_date TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      counterparty TEXT,
      description TEXT,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'booked',
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_id, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, booking_date DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(booking_date DESC);

    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rules_priority ON category_rules(priority DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      transactions_added INTEGER DEFAULT 0,
      status TEXT,
      error TEXT
    );
  `);

  seedDefaultRules(db);
  seedDefaultSettings(db);
}

function seedDefaultRules(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM category_rules').get() as { n: number };
  if (count.n > 0) return;
  const insert = db.prepare(
    'INSERT INTO category_rules (keyword, category, priority) VALUES (?, ?, ?)',
  );
  const seeds: Array<[string, string, number]> = [
    // Income (high priority so it wins over generic terms)
    ['gehalt', 'Einkommen', 100],
    ['lohn', 'Einkommen', 100],
    ['salary', 'Einkommen', 100],
    ['payroll', 'Einkommen', 100],
    // Groceries
    ['rewe', 'Lebensmittel', 50],
    ['edeka', 'Lebensmittel', 50],
    ['aldi', 'Lebensmittel', 50],
    ['lidl', 'Lebensmittel', 50],
    ['kaufland', 'Lebensmittel', 50],
    ['penny', 'Lebensmittel', 50],
    ['netto', 'Lebensmittel', 50],
    ['dm-drogerie', 'Lebensmittel', 50],
    ['rossmann', 'Lebensmittel', 50],
    // Housing
    ['miete', 'Wohnen', 60],
    ['vermiet', 'Wohnen', 60],
    ['hausverwaltung', 'Wohnen', 60],
    ['nebenkosten', 'Wohnen', 60],
    ['strom', 'Wohnen', 55],
    ['vattenfall', 'Wohnen', 55],
    ['eon', 'Wohnen', 55],
    // Transport
    ['shell', 'Transport', 50],
    ['aral', 'Transport', 50],
    ['esso', 'Transport', 50],
    ['db vertrieb', 'Transport', 50],
    ['deutsche bahn', 'Transport', 50],
    ['bvg', 'Transport', 50],
    ['mvg', 'Transport', 50],
    ['uber', 'Transport', 50],
    ['bolt', 'Transport', 50],
    ['flixbus', 'Transport', 50],
    // Eating out
    ['restaurant', 'Essen gehen', 50],
    ['mcdonald', 'Essen gehen', 50],
    ['burger king', 'Essen gehen', 50],
    ['lieferando', 'Essen gehen', 50],
    ['wolt', 'Essen gehen', 50],
    ['cafe', 'Essen gehen', 45],
    ['starbucks', 'Essen gehen', 50],
    // Subscriptions
    ['netflix', 'Abos', 60],
    ['spotify', 'Abos', 60],
    ['amazon prime', 'Abos', 60],
    ['disney', 'Abos', 60],
    ['apple.com/bill', 'Abos', 60],
    ['youtube premium', 'Abos', 60],
    // Health
    ['apotheke', 'Gesundheit', 50],
    ['arzt', 'Gesundheit', 50],
    ['krankenkasse', 'Gesundheit', 60],
    // Cash
    ['atm', 'Bargeld', 70],
    ['geldautomat', 'Bargeld', 70],
  ];
  const tx = db.transaction(() => {
    for (const [kw, cat, prio] of seeds) insert.run(kw, cat, prio);
  });
  tx();
}

function seedDefaultSettings(db: Database.Database): void {
  const exists = db.prepare("SELECT value FROM settings WHERE key = 'default_currency'").get();
  if (!exists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('default_currency', 'EUR')").run();
  }
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
