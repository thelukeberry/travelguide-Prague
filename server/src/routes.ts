import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDb } from './db';
import { goCardless, GoCardlessError } from './gocardless/client';
import { config } from './config';
import { createConnection, finalizeConnection, deleteConnection } from './connect';
import { syncAllAccounts, syncAccount } from './sync';
import { buildSummary } from './summary';
import { invalidateRulesCache } from './categorize';

export const apiRouter = Router();

// Simple optional auth: when API_TOKEN is set, require a matching header.
apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (!config.apiToken) return next();
  const provided = req.header('x-api-token');
  if (provided !== config.apiToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

function wrap<T>(handler: (req: Request, res: Response) => Promise<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent) res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

apiRouter.get(
  '/institutions',
  wrap(async (req) => {
    const country = String(req.query.country ?? config.defaultCountry).toLowerCase();
    const institutions = await goCardless.listInstitutions(country);
    return institutions.map((i) => ({
      id: i.id,
      name: i.name,
      bic: i.bic ?? null,
      logo: i.logo ?? null,
      transactionHistoryDays: i.transaction_total_days ? Number(i.transaction_total_days) : null,
    }));
  }),
);

apiRouter.post(
  '/connect',
  wrap(async (req) => {
    const { institution_id, institution_name } = req.body ?? {};
    if (!institution_id || !institution_name) {
      const err = new Error('institution_id and institution_name are required') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    const result = await createConnection(String(institution_id), String(institution_name));
    return result;
  }),
);

apiRouter.get(
  '/connect/callback',
  wrap(async (req) => {
    const requisitionId = String(req.query.requisition_id ?? '');
    const reference = String(req.query.ref ?? '');
    let lookupId = requisitionId;
    if (!lookupId && reference) {
      const db = getDb();
      const row = db
        .prepare('SELECT requisition_id FROM connections WHERE reference = ?')
        .get(reference) as { requisition_id: string } | undefined;
      lookupId = row?.requisition_id ?? '';
    }
    if (!lookupId) {
      const err = new Error('requisition_id or ref query parameter is required') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    return finalizeConnection(lookupId);
  }),
);

apiRouter.post(
  '/sync',
  wrap(async (req) => {
    const accountId = req.body?.account_id ? String(req.body.account_id) : null;
    if (accountId) {
      return { results: [await syncAccount(accountId)] };
    }
    return { results: await syncAllAccounts() };
  }),
);

apiRouter.get(
  '/accounts',
  wrap(async () => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT a.id, a.iban, a.name, a.owner_name AS ownerName, a.currency, a.product,
                a.balance, a.balance_type AS balanceType, a.balance_updated_at AS balanceUpdatedAt,
                a.last_synced_at AS lastSyncedAt,
                c.institution_name AS institutionName, c.status AS connectionStatus,
                c.expires_at AS expiresAt, c.id AS connectionId
         FROM accounts a
         JOIN connections c ON c.id = a.connection_id
         ORDER BY c.institution_name, a.name`,
      )
      .all();
    return rows;
  }),
);

apiRouter.get(
  '/connections',
  wrap(async () => {
    const db = getDb();
    return db
      .prepare(
        `SELECT c.id, c.institution_id AS institutionId, c.institution_name AS institutionName,
                c.status, c.linked_at AS linkedAt, c.expires_at AS expiresAt,
                (SELECT COUNT(*) FROM accounts a WHERE a.connection_id = c.id) AS accountCount
         FROM connections c
         ORDER BY c.linked_at DESC`,
      )
      .all();
  }),
);

apiRouter.get(
  '/transactions',
  wrap(async (req) => {
    const db = getDb();
    const params: unknown[] = [];
    const where: string[] = ["status = 'booked'"];
    if (req.query.from) {
      where.push('booking_date >= ?');
      params.push(String(req.query.from));
    }
    if (req.query.to) {
      where.push('booking_date <= ?');
      params.push(String(req.query.to));
    }
    if (req.query.category) {
      where.push('category = ?');
      params.push(String(req.query.category));
    }
    if (req.query.account_id) {
      where.push('account_id = ?');
      params.push(String(req.query.account_id));
    }
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    const sql = `SELECT id, account_id AS accountId, external_id AS externalId,
                        booking_date AS bookingDate, value_date AS valueDate,
                        amount, currency, counterparty, description, category, status
                 FROM transactions
                 WHERE ${where.join(' AND ')}
                 ORDER BY booking_date DESC, id DESC
                 LIMIT ${limit}`;
    return db.prepare(sql).all(...params);
  }),
);

apiRouter.get(
  '/summary',
  wrap(async () => buildSummary()),
);

apiRouter.delete(
  '/connections/:id',
  wrap(async (req) => {
    await deleteConnection(req.params.id);
    return { ok: true };
  }),
);

apiRouter.get(
  '/categories/rules',
  wrap(async () => {
    const db = getDb();
    return db
      .prepare('SELECT id, keyword, category, priority FROM category_rules ORDER BY priority DESC, keyword')
      .all();
  }),
);

apiRouter.post(
  '/categories/rules',
  wrap(async (req) => {
    const { keyword, category, priority } = req.body ?? {};
    if (!keyword || !category) {
      const err = new Error('keyword and category are required') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    const db = getDb();
    const result = db
      .prepare('INSERT INTO category_rules (keyword, category, priority) VALUES (?, ?, ?)')
      .run(String(keyword), String(category), Number(priority ?? 50));
    invalidateRulesCache();
    return { id: result.lastInsertRowid };
  }),
);

apiRouter.delete(
  '/categories/rules/:id',
  wrap(async (req) => {
    const db = getDb();
    db.prepare('DELETE FROM category_rules WHERE id = ?').run(req.params.id);
    invalidateRulesCache();
    return { ok: true };
  }),
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
apiRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof GoCardlessError) {
    res.status(err.status === 429 ? 429 : 502).json({
      error: 'gocardless_error',
      status: err.status,
      message: err.summary ?? err.message,
      rateLimited: err.isRateLimited(),
    });
    return;
  }
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  const message = err instanceof Error ? err.message : 'internal error';
  res.status(status).json({ error: 'server_error', message });
});
