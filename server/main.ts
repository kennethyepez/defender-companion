import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { HandoffReader } from './handoff';
import { assertServiceIsolation } from './isolation';
if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
const port = Number(env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port.');
if (env.ENTRA_CLIENT_SECRET || env.ENTRA_TENANT_ID || env.ENTRA_CLIENT_ID)
  throw new Error(
    'Remove Microsoft credentials from the backend environment. Use the protected collector handoff.',
  );
if (env.HOST && env.HOST !== '127.0.0.1')
  throw new Error('The backend binds only to 127.0.0.1. Use the approved private proxy.');
const origin = env.APP_ORIGIN ?? 'http://localhost:4318';
const privateMode = new URL(origin).protocol === 'https:';
// A real collector file never relaxes its identity boundary for a localhost origin.
if (privateMode || env.HANDOFF_FILE)
  await assertServiceIsolation(
    env.SERVICE_ACCOUNT_ID ?? '',
    env.HANDOFF_FILE ?? '',
    env.PROTECTED_COLLECTOR_FILE ?? '',
  );
const { app } = await buildApp({
  origin,
  rpId: env.RP_ID ?? 'localhost',
  bootstrapToken: env.BOOTSTRAP_TOKEN,
  databasePath: env.DATABASE_PATH ?? 'data/companion.sqlite',
  source: env.HANDOFF_FILE ? new HandoffReader(env.HANDOFF_FILE) : undefined,
  boundary: privateMode
    ? {
        mode: 'tailnet',
        allowedLogins: (env.ALLOWED_TAILNET_LOGINS ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }
    : { mode: 'loopback' },
});
await app.listen({ host: '127.0.0.1', port });
console.info(
  `Private workspace listening on ${env.APP_ORIGIN ?? 'http://localhost:4318'} — read-only, passkey protected.`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
