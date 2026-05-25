import { getDb } from './db';

export interface Summary {
  netWorth: number;
  currency: string;
  month: {
    income: number;
    expenses: number;
    savingsRate: number; // 0..1
    byCategory: Array<{ category: string; amount: number }>;
  };
  history: Array<{ month: string; income: number; expenses: number; net: number }>;
  subscriptions: Array<{
    counterparty: string;
    amount: number;
    lastDate: string;
    occurrences: number;
  }>;
  recent: Array<{
    id: number;
    bookingDate: string | null;
    amount: number;
    currency: string;
    counterparty: string | null;
    description: string | null;
    category: string | null;
  }>;
}

function startOfMonthIso(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function monthLabel(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildSummary(): Summary {
  const db = getDb();

  const balances = db
    .prepare('SELECT COALESCE(SUM(balance), 0) AS net FROM accounts')
    .get() as { net: number };

  const currencyRow = db
    .prepare("SELECT value FROM settings WHERE key = 'default_currency'")
    .get() as { value: string } | undefined;
  const currency = currencyRow?.value ?? 'EUR';

  const monthStart = startOfMonthIso();
  const monthRows = db
    .prepare(
      `SELECT
         SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE status = 'booked' AND booking_date >= ?`,
    )
    .get(monthStart) as { income: number | null; expenses: number | null };

  const income = monthRows.income ?? 0;
  const expenses = monthRows.expenses ?? 0;
  const savingsRate = income > 0 ? Math.max(0, (income - expenses) / income) : 0;

  const byCategory = db
    .prepare(
      `SELECT COALESCE(category, 'Sonstiges') AS category, SUM(-amount) AS amount
       FROM transactions
       WHERE status = 'booked' AND amount < 0 AND booking_date >= ?
       GROUP BY category
       ORDER BY amount DESC`,
    )
    .all(monthStart) as Array<{ category: string; amount: number }>;

  // 6-month history
  const history: Summary['history'] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = addMonths(now, -i);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const end = addMonths(start, 1);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
           SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses
         FROM transactions
         WHERE status = 'booked' AND booking_date >= ? AND booking_date < ?`,
      )
      .get(startIso, endIso) as { income: number | null; expenses: number | null };
    const inc = row.income ?? 0;
    const exp = row.expenses ?? 0;
    history.push({ month: monthLabel(start), income: inc, expenses: exp, net: inc - exp });
  }

  // Subscriptions: same counterparty, amount within €0.50, ≥3 months in a row
  const subscriptions = db
    .prepare(
      `SELECT counterparty,
              ROUND(AVG(amount), 2) AS amount,
              MAX(booking_date) AS lastDate,
              COUNT(DISTINCT substr(booking_date, 1, 7)) AS occurrences
       FROM transactions
       WHERE status = 'booked'
         AND amount < 0
         AND counterparty IS NOT NULL
         AND booking_date IS NOT NULL
         AND booking_date >= date('now', '-6 months')
       GROUP BY counterparty, ROUND(amount, 0)
       HAVING occurrences >= 2
       ORDER BY lastDate DESC, amount ASC
       LIMIT 20`,
    )
    .all() as Array<{
    counterparty: string;
    amount: number;
    lastDate: string;
    occurrences: number;
  }>;

  const recent = db
    .prepare(
      `SELECT id, booking_date AS bookingDate, amount, currency, counterparty, description, category
       FROM transactions
       WHERE status = 'booked'
       ORDER BY booking_date DESC, id DESC
       LIMIT 15`,
    )
    .all() as Summary['recent'];

  return {
    netWorth: balances.net ?? 0,
    currency,
    month: { income, expenses, savingsRate, byCategory },
    history,
    subscriptions,
    recent,
  };
}
