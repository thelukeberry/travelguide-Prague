/* eslint-disable no-console */
import { tokenManager } from '../gocardless/TokenManager';
import { goCardless } from '../gocardless/client';
import { config, assertSecretsConfigured } from '../config';

/**
 * Smoke-tests the GoCardless integration against the sandbox bank
 * SANDBOXFINANCE_SFIN0000. Does NOT touch the local database — it prints the
 * URL you would need to open in a browser to finish the linking flow.
 *
 * Run with:  npm --prefix server run test:sandbox
 */
async function main(): Promise<void> {
  assertSecretsConfigured();
  console.log('1) Obtaining access token …');
  const token = await tokenManager.getAccessToken();
  console.log(`   ✓ got access token (${token.slice(0, 12)}…)`);

  console.log('2) Listing institutions for country', config.defaultCountry, '…');
  const institutions = await goCardless.listInstitutions(config.defaultCountry);
  console.log(`   ✓ ${institutions.length} institutions returned`);
  const sandboxId = 'SANDBOXFINANCE_SFIN0000';
  const sandbox = institutions.find((i) => i.id === sandboxId);
  if (!sandbox) {
    console.log(
      '   ⚠️  Sandbox institution not found in current country list — using id literal anyway.',
    );
  } else {
    console.log(`   ✓ found sandbox: ${sandbox.name}`);
  }

  console.log('3) Creating end-user agreement …');
  const agreement = await goCardless.createAgreement({
    institution_id: sandboxId,
    max_historical_days: 90,
    access_valid_for_days: 90,
    access_scope: ['balances', 'details', 'transactions'],
  });
  console.log(`   ✓ agreement ${agreement.id}`);

  console.log('4) Creating requisition …');
  const reference = `sandbox-${Date.now()}`;
  const requisition = await goCardless.createRequisition({
    redirect: config.redirectUri,
    institution_id: sandboxId,
    agreement: agreement.id,
    reference,
    user_language: 'DE',
  });
  console.log(`   ✓ requisition ${requisition.id} (status ${requisition.status})`);
  console.log(`   → open this URL in a browser to finish linking:\n     ${requisition.link}`);
  console.log(`   reference: ${reference}`);
  console.log('\nDone. After completing the flow you can run');
  console.log(`  curl "http://localhost:${config.port}/api/connect/callback?requisition_id=${requisition.id}"`);
}

main().catch((err) => {
  console.error('Sandbox test failed:', err);
  process.exit(1);
});
