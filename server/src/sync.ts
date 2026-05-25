import { getDb } from './db';
import { goCardless, GoCardlessError } from './gocardless/client';
import { categorize } from './categorize';
import type { AccountBalance, RawTransaction } from './gocardless/types';

/**
 * Picks the most "current" balance from GoCardless's array of balanceType entries.
 * Preference order (closest to what a human reads as "current balance"):
 *   1. interimAvailable
 *   2. expected
 *   3. closingBooked
 *   4. interimBooked
 *   5. anything else
 */
function pickBalance(balances: AccountBalance[]): AccountBalance | null {
  if (!balances.length) return null;
  const preferred = ['interimAvailable', 'expected', 'closingBooked', 'interimBooked'];
  for (const type of preferred) {
    const found = balances.find((b) => b.balanceType === type);
    if (found) return found;
  }
  return balances[0];
}

function describe(raw: RawTransaction): string {
  if (raw.remittanceInformationUnstructured) return raw.remittanceInformationUnstructured;
  if (raw.remittanceInformationUnstructuredArray?.length) {
    return raw.remittanceInformationUnstructuredArray.join(' ');
  }
  if (raw.additionalInformation) return raw.additionalInformation;
  return '';
}

function counterpartyOf(raw: RawTransaction, isCredit: boolean): string | null {
  if (isCredit && raw.debtorName) return raw.debtorName;
  if (!isCredit && raw.creditorName) return raw.creditorName;
  return raw.creditorName ?? raw.debtorName ?? null;
}

function externalIdOf(raw: RawTransaction, fallbackKey: string): string {
  if (raw.transactionId) return raw.transactionId;
  if (raw.internalTransactionId) return raw.internalTransactionId;
  return fallbackKey;
}

export interface SyncAccountResult {
  accountId: string;
  added: number;
  balance: number | null;
  status: 'ok' | 'rate_limited' | 'error';
  error?: string;
}

export async function syncAccount(accountId: string): Promise<SyncAccountResult> {
  const db = getDb();
  const log = db
    .prepare(
      "INSERT INTO sync_log (account_id, started_at, status) VALUES (?, datetime('now'), 'running')",
    )
    .run(accountId);
  const logId = log.lastInsertRowid as number;

  try {
    // Balances
    let pickedBalance: AccountBalance | null = null;
    try {
      const balances = await goCardless.getAccountBalances(accountId);
      pickedBalance = pickBalance(balances.balances ?? []);
      if (pickedBalance) {
        const amount = Number(pickedBalance.balanceAmount.amount);
        db.prepare(
          "UPDATE accounts SET balance = ?, balance_type = ?, balance_updated_at = datetime('now') WHERE id = ?",
        ).run(amount, pickedBalance.balanceType, accountId);
      }
    } catch (err) {
      if (err instanceof GoCardlessError && err.isRateLimited()) {
        db.prepare(
          "UPDATE sync_log SET finished_at = datetime('now'), status = 'rate_limited', error = ? WHERE id = ?",
        ).run('balances rate-limited', logId);
        return { accountId, added: 0, balance: null, status: 'rate_limited' };
      }
      throw err;
    }

    // Transactions
    const tx = await goCardless.getAccountTransactions(accountId);
    const booked = tx.transactions.booked ?? [];
    const pending = tx.transactions.pending ?? [];

    const exists = db.prepare(
      'SELECT 1 FROM transactions WHERE account_id = ? AND external_id = ?',
    );
    const insert = db.prepare(`
      INSERT INTO transactions
        (account_id, external_id, booking_date, value_date, amount, currency, counterparty, description, category, status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, external_id) DO UPDATE SET
        booking_date = excluded.booking_date,
        value_date = excluded.value_date,
        amount = excluded.amount,
        currency = excluded.currency,
        counterparty = excluded.counterparty,
        description = excluded.description,
        status = excluded.status
    `);

    let added = 0;
    const upsertBatch = db.transaction((rows: RawTransaction[], status: 'booked' | 'pending') => {
      rows.forEach((raw, idx) => {
        const amount = Number(raw.transactionAmount?.amount ?? '0');
        if (!Number.isFinite(amount)) return;
        const currency = raw.transactionAmount?.currency ?? 'EUR';
        const isCredit = amount > 0;
        const desc = describe(raw);
        const cp = counterpartyOf(raw, isCredit);
        const category = categorize(db, { description: desc, counterparty: cp, amount });
        const extId = externalIdOf(
          raw,
          `${status}-${raw.bookingDate ?? raw.valueDate ?? 'na'}-${amount}-${idx}`,
        );
        const isNew = !exists.get(accountId, extId);
        insert.run(
          accountId,
          extId,
          raw.bookingDate ?? null,
          raw.valueDate ?? null,
          amount,
          currency,
          cp,
          desc,
          category,
          status,
          JSON.stringify(raw),
        );
        if (isNew) added += 1;
      });
    });

    upsertBatch(booked, 'booked');
    upsertBatch(pending, 'pending');

    db.prepare(
      "UPDATE accounts SET last_synced_at = datetime('now') WHERE id = ?",
    ).run(accountId);

    db.prepare(
      "UPDATE sync_log SET finished_at = datetime('now'), status = 'ok', transactions_added = ? WHERE id = ?",
    ).run(added, logId);

    return {
      accountId,
      added,
      balance: pickedBalance ? Number(pickedBalance.balanceAmount.amount) : null,
      status: 'ok',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      "UPDATE sync_log SET finished_at = datetime('now'), status = 'error', error = ? WHERE id = ?",
    ).run(msg, logId);
    if (err instanceof GoCardlessError && err.isRateLimited()) {
      return { accountId, added: 0, balance: null, status: 'rate_limited', error: msg };
    }
    return { accountId, added: 0, balance: null, status: 'error', error: msg };
  }
}

export async function syncAllAccounts(): Promise<SyncAccountResult[]> {
  const db = getDb();
  const accounts = db.prepare('SELECT id FROM accounts').all() as Array<{ id: string }>;
  const results: SyncAccountResult[] = [];
  for (const acc of accounts) {
    const r = await syncAccount(acc.id);
    results.push(r);
    // gentle pacing — banks are touchy
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return results;
}
