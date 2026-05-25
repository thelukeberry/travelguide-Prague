import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: false });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  secretId: process.env.SECRET_ID ?? '',
  secretKey: process.env.SECRET_KEY ?? '',
  port: Number(process.env.PORT ?? 3001),
  databaseFile: process.env.DATABASE_FILE ?? path.resolve(process.cwd(), 'data/finance.db'),
  redirectUri: process.env.REDIRECT_URI ?? 'http://localhost:5173/callback',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  syncCron: process.env.SYNC_CRON ?? '0 7,19 * * *',
  apiToken: process.env.API_TOKEN ?? '',
  defaultCountry: (process.env.DEFAULT_COUNTRY ?? 'de').toLowerCase(),
  goCardlessBaseUrl: 'https://bankaccountdata.gocardless.com/api/v2',
};

export function assertSecretsConfigured(): void {
  if (!config.secretId || !config.secretKey) {
    throw new Error(
      'GoCardless secrets are not configured. Set SECRET_ID and SECRET_KEY in your .env file.',
    );
  }
}

export { required };
