import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { MicrosoftReader } from './microsoft';
if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
const port = Number(env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port.');
const hasCredentials = !!(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET);
const { app } = await buildApp({
  origin: env.APP_ORIGIN ?? 'http://localhost:4318',
  rpId: env.RP_ID ?? 'localhost',
  bootstrapToken: env.BOOTSTRAP_TOKEN,
  databasePath: env.DATABASE_PATH ?? 'data/companion.sqlite',
  reader: hasCredentials
    ? new MicrosoftReader({
        tenantId: env.ENTRA_TENANT_ID!,
        clientId: env.ENTRA_CLIENT_ID!,
        clientSecret: env.ENTRA_CLIENT_SECRET!,
      })
    : undefined,
});
await app.listen({ host: env.HOST ?? '127.0.0.1', port });
console.info(
  `Private workspace listening on ${env.APP_ORIGIN ?? 'http://localhost:4318'} — read-only, passkey protected.`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
