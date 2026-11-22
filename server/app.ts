import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Store } from './store';
import { registerAuth, authNames, AuthFailure } from './auth';
import { permitsRequest, validateBoundary, type Boundary } from './boundary';
import { type WorkspaceSource } from './handoff';

export type Config = {
  origin: string;
  rpId: string;
  bootstrapToken?: string;
  databasePath: string;
  staticPath?: string;
  source?: WorkspaceSource;
  boundary?: Boundary;
};
export async function buildApp(config: Config) {
  const origin = new URL(config.origin);
  if (origin.origin !== config.origin || config.rpId !== origin.hostname)
    throw new Error('Use an exact HTTPS origin and matching RP ID; HTTP is limited to localhost.');
  const boundary: Boundary = config.boundary ?? { mode: 'loopback' };
  validateBoundary(origin, boundary);
  if (config.bootstrapToken && config.bootstrapToken.length < 32)
    throw new Error('Use a cryptographically random setup token of at least 32 characters.');
  const store = new Store(config.databasePath);
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    requestTimeout: 20000,
    trustProxy: false,
  });
  const secure = origin.protocol === 'https:';
  const names = authNames(secure);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: secure ? [] : null,
      },
    },
  });
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ message: 'Too many requests. Wait a minute and try again.' }),
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!permitsRequest(request, boundary, origin)) {
      store.audit('access-boundary', 'denied', '', request.ip);
      return reply
        .code(403)
        .send({ message: 'This workspace is restricted to the approved private access path.' });
    }
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    const activeSession = store.session(
      request.cookies[names.session],
      Date.now(),
      store.matchesBinding(request.cookies[names.session], request.headers['x-workspace-binding']),
    );
    if (activeSession) {
      reply.header('X-Session-Expires-At', String(activeSession.expires));
      reply.header(
        'X-Session-Idle-Expires-At',
        String(Math.min(activeSession.expires, activeSession.lastSeen + 15 * 60_000)),
      );
    }
    if (request.method !== 'GET' && request.headers.origin !== config.origin) {
      store.audit('access-boundary', 'denied', '', request.ip);
      return reply
        .code(403)
        .send({ message: 'This request must come from the configured workspace origin.' });
    }
    if (!request.url.startsWith('/api/auth/')) {
      const session = activeSession;
      if (
        !session ||
        session.recovery ||
        !store.matchesBinding(
          request.cookies[names.session],
          request.headers['x-workspace-binding'],
        )
      ) {
        store.audit('data-access', 'denied', '', request.ip);
        return reply
          .code(401)
          .send({ message: 'Sign in with a passkey to read the private workspace.' });
      }
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const route = request.routeOptions.url ?? '';
    const kind = route.includes('/auth/login')
      ? 'login'
      : route.includes('/auth/register')
        ? 'registration'
        : route.includes('/auth/step-up')
          ? 'step-up'
          : route.includes('/auth/recover')
            ? 'recovery'
            : 'request-rejected';
    try {
      store.audit(kind, 'denied', '', request.ip);
    } catch {
      return reply
        .code(503)
        .send({ message: 'Security state is unavailable. Contact the administrator.' });
    }
    const status =
      error instanceof z.ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 400);
    return reply.code(status).send({
      message:
        status === 429
          ? 'Too many requests. Try again later.'
          : error instanceof AuthFailure
            ? error.message
            : 'The request could not be verified. Start again and try once more.',
    });
  });
  await registerAuth(app, store, config);
  app.get('/api/workspace', async (request, reply) => {
    if (!config.source) {
      store.audit('workspace-read', 'unavailable', '', request.ip);
      return reply.code(503).send({
        message:
          'The protected collector handoff is not configured. No Microsoft credentials belong in this backend.',
      });
    }
    try {
      const snapshot = await config.source.read();
      store.audit(
        'workspace-read',
        snapshot.freshness?.state === 'stale'
          ? 'stale'
          : snapshot.freshness?.state === 'unavailable'
            ? 'unavailable'
            : 'success',
        '',
        request.ip,
      );
      return snapshot;
    } catch {
      store.audit('workspace-read', 'unavailable', '', request.ip);
      return reply.code(503).send({
        message:
          'The collector handoff cannot be verified. Coverage is unavailable; no sample records are substituted.',
      });
    }
  });
  app.post('/api/workspace/export', async (request, reply) => {
    z.object({ confirm: z.literal(true) }).parse(request.body);
    if (!config.source)
      return reply.code(503).send({ message: 'The collector handoff is not configured.' });
    try {
      const data = await config.source.read();
      store.audit('workspace-export', 'success', '', request.ip);
      return {
        source: 'private-collector-summary',
        lastSuccessfulReadAt: data.fetchedAt,
        coverage: data.freshness?.state ?? 'unavailable',
        alertCounts: {
          total: data.alerts.length,
          open: data.alerts.filter((alert) => alert.status !== 'resolved').length,
          high: data.alerts.filter((alert) => alert.severity === 'high').length,
        },
        deviceCount: data.devices.length,
        exportedAt: new Date().toISOString(),
      };
    } catch {
      store.audit('workspace-export', 'unavailable', '', request.ip);
      return reply.code(503).send({ message: 'The source summary is unavailable.' });
    }
  });
  app.get('/api/records/:resource', async (_request, reply) =>
    reply.code(404).send({
      message:
        'This view is not supplied by the alert-only collector. No additional API permission has been requested.',
    }),
  );
  app.all('/api/*', async (_request, reply) =>
    reply.code(404).send({
      message:
        'This API operation does not exist. The workspace has no Defender mutation endpoints.',
    }),
  );
  const staticPath = resolve(config.staticPath ?? 'dist');
  if (existsSync(staticPath)) await app.register(serveStatic, { root: staticPath });
  app.addHook('onClose', async () => store.close());
  return { app, store };
}
