import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config';
import { getDb } from './db';
import { apiRouter } from './routes';
import { syncAllAccounts } from './sync';

function main(): void {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin: config.clientOrigin === '*' ? true : config.clientOrigin.split(','),
      credentials: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  // Init DB before serving requests.
  getDb();

  if (cron.validate(config.syncCron)) {
    cron.schedule(config.syncCron, async () => {
      console.log(`[cron] running scheduled sync (${new Date().toISOString()})`);
      try {
        const results = await syncAllAccounts();
        const total = results.reduce((sum, r) => sum + r.added, 0);
        console.log(`[cron] sync done — ${total} new transactions across ${results.length} accounts`);
      } catch (err) {
        console.error('[cron] sync failed:', err);
      }
    });
    console.log(`[cron] scheduled sync with pattern "${config.syncCron}"`);
  } else {
    console.warn(`[cron] invalid pattern "${config.syncCron}" — scheduled sync disabled`);
  }

  app.listen(config.port, () => {
    console.log(`Finance backend listening on http://localhost:${config.port}`);
    console.log(`Frontend expected at ${config.clientOrigin} — redirect URI is ${config.redirectUri}`);
    if (!config.secretId || !config.secretKey) {
      console.warn(
        '⚠️  SECRET_ID / SECRET_KEY are not set. /api/institutions and /api/connect will fail until you configure them in .env.',
      );
    }
  });
}

main();
