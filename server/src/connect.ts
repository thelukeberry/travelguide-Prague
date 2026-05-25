import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import { goCardless } from './gocardless/client';
import { config } from './config';
import { syncAccount } from './sync';

export interface CreateConnectionResult {
  connectionId: string;
  link: string;
  requisitionId: string;
}

export async function createConnection(
  institutionId: string,
  institutionName: string,
): Promise<CreateConnectionResult> {
  const db = getDb();
  const reference = uuidv4();

  const agreement = await goCardless.createAgreement({
    institution_id: institutionId,
    max_historical_days: 730,
    access_valid_for_days: 90,
    access_scope: ['balances', 'details', 'transactions'],
  });

  const requisition = await goCardless.createRequisition({
    redirect: config.redirectUri,
    institution_id: institutionId,
    agreement: agreement.id,
    reference,
    user_language: 'DE',
  });

  const connectionId = uuidv4();
  const expiresAt = new Date(
    Date.now() + (agreement.access_valid_for_days ?? 90) * 24 * 3600 * 1000,
  ).toISOString();

  db.prepare(
    `INSERT INTO connections
      (id, institution_id, institution_name, requisition_id, agreement_id, reference, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    connectionId,
    institutionId,
    institutionName,
    requisition.id,
    agreement.id,
    reference,
    requisition.status,
    expiresAt,
  );

  return { connectionId, link: requisition.link, requisitionId: requisition.id };
}

export async function finalizeConnection(requisitionId: string): Promise<{
  status: string;
  accountIds: string[];
  connectionId: string | null;
}> {
  const db = getDb();
  const requisition = await goCardless.getRequisition(requisitionId);

  const conn = db
    .prepare('SELECT id FROM connections WHERE requisition_id = ?')
    .get(requisitionId) as { id: string } | undefined;

  db.prepare(
    `UPDATE connections
      SET status = ?,
          linked_at = CASE WHEN ? = 'LN' THEN datetime('now') ELSE linked_at END
      WHERE requisition_id = ?`,
  ).run(requisition.status, requisition.status, requisitionId);

  if (requisition.status !== 'LN') {
    return {
      status: requisition.status,
      accountIds: requisition.accounts ?? [],
      connectionId: conn?.id ?? null,
    };
  }

  if (!conn) {
    return {
      status: requisition.status,
      accountIds: requisition.accounts ?? [],
      connectionId: null,
    };
  }

  for (const accountId of requisition.accounts ?? []) {
    await ensureAccountStored(conn.id, accountId);
  }

  // Kick off an initial sync per account (history fetch).
  for (const accountId of requisition.accounts ?? []) {
    try {
      await syncAccount(accountId);
    } catch {
      // ignore — surfaced via /api/summary errors / sync_log
    }
  }

  return {
    status: requisition.status,
    accountIds: requisition.accounts ?? [],
    connectionId: conn.id,
  };
}

async function ensureAccountStored(connectionId: string, accountId: string): Promise<void> {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
  if (existing) return;

  let detailsName: string | null = null;
  let iban: string | null = null;
  let currency: string | null = null;
  let product: string | null = null;
  let ownerName: string | null = null;
  let type: string | null = null;

  try {
    const details = await goCardless.getAccountDetails(accountId);
    const a = details.account ?? {};
    detailsName = a.name ?? a.product ?? null;
    iban = a.iban ?? null;
    currency = a.currency ?? null;
    product = a.product ?? null;
    ownerName = a.ownerName ?? null;
    type = a.cashAccountType ?? null;
  } catch {
    // proceed even if details endpoint fails; sync will retry later
  }

  db.prepare(
    `INSERT INTO accounts
      (id, connection_id, iban, name, owner_name, currency, product, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(accountId, connectionId, iban, detailsName, ownerName, currency, product, type);
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const db = getDb();
  const row = db
    .prepare('SELECT requisition_id FROM connections WHERE id = ?')
    .get(connectionId) as { requisition_id: string } | undefined;
  if (!row) return;
  try {
    await goCardless.deleteRequisition(row.requisition_id);
  } catch {
    // best-effort: still drop locally
  }
  db.prepare('DELETE FROM connections WHERE id = ?').run(connectionId);
}
