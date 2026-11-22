import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { equalSecret, Store } from './store';
import {
  mapAlert,
  mapDevice,
  mapRecord,
  MicrosoftReader,
  resources,
  UpstreamError,
  type Resource,
} from './microsoft';

export type Config = {
  origin: string;
  rpId: string;
  bootstrapToken?: string;
  databasePath: string;
  staticPath?: string;
  reader?: Pick<MicrosoftReader, 'read'>;
};
export async function buildApp(config: Config) {
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    config.rpId !== origin.hostname ||
    (origin.protocol !== 'https:' &&
      !(origin.protocol === 'http:' && origin.hostname === 'localhost'))
  )
    throw new Error(
      'Use an exact HTTPS origin and matching RP ID. HTTP is limited to localhost development.',
    );
  if (config.bootstrapToken && config.bootstrapToken.length < 32)
    throw new Error('Use a cryptographically random bootstrap token of at least 32 characters.');
  const store = new Store(config.databasePath);
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    requestTimeout: 20000,
    trustProxy: false,
  });
  const secure = origin.protocol === 'https:';
  const sessionCookie = secure ? '__Host-dc-session' : 'dc-session';
  const challengeCookie = secure ? '__Host-dc-challenge' : 'dc-challenge';
  const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure, path: '/' };
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
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.headers.origin !== config.origin)
      return reply
        .code(403)
        .send({ message: 'This request must come from the configured workspace origin.' });
    if (!request.url.startsWith('/api/auth/')) {
      const session = store.session(request.cookies[sessionCookie]);
      if (!session || session.recovery)
        return reply.code(401).send({ message: 'Sign in with a passkey to read your workspace.' });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error instanceof UpstreamError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : ((error as { statusCode?: number }).statusCode ?? 400);
    reply.code(status).send({
      message:
        error instanceof UpstreamError
          ? error.message
          : status === 429
            ? 'Too many requests. Try again later.'
            : 'The request could not be verified. Check the input and try again.',
    });
  });
  const authRate = { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } };
  app.get('/api/auth/status', async (request) => ({
    enrolled: store.enrolled(),
    authenticated: !!store.session(request.cookies[sessionCookie]),
  }));
  app.post('/api/auth/register/options', authRate, async (request, reply) => {
    const body = z.object({ token: z.string().max(512).optional() }).parse(request.body);
    if (
      store.enrolled()
        ? !store.session(request.cookies[sessionCookie])
        : !config.bootstrapToken || !body.token || !equalSecret(body.token, config.bootstrapToken)
    )
      return reply.code(403).send({
        message:
          'Use the private setup token for initial enrollment, or an authenticated session to add a passkey.',
      });
    const options = await generateRegistrationOptions({
      rpName: 'Defender Companion',
      rpID: config.rpId,
      userName: 'workspace-administrator',
      userDisplayName: 'Workspace administrator',
      userID: new Uint8Array(Buffer.from(store.userId(), 'base64url')),
      attestationType: 'none',
      excludeCredentials: store
        .credentials()
        .map((credential) => ({ id: credential.id, transports: credential.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const id = store.createChallenge(options.challenge, 'register');
    reply.setCookie(challengeCookie, id, { ...cookieOptions, maxAge: 120 });
    return options;
  });
  app.post('/api/auth/register/verify', authRate, async (request, reply) => {
    const challenge = store.takeChallenge(request.cookies[challengeCookie], 'register');
    reply.clearCookie(challengeCookie, cookieOptions);
    if (!challenge || (store.enrolled() && !store.session(request.cookies[sessionCookie])))
      return reply
        .code(400)
        .send({ message: 'Registration expired or was already used. Start again.' });
    const { response } = z
      .object({ response: z.record(z.string(), z.unknown()) })
      .parse(request.body);
    const verification = await verifyRegistrationResponse({
      response: response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo)
      return reply.code(400).send({ message: 'The passkey could not be verified.' });
    store.addCredential(verification.registrationInfo.credential);
    const recoveryCodes = store.issueRecoveryCodes();
    store.revoke(request.cookies[sessionCookie]);
    const session = store.createSession();
    reply.setCookie(sessionCookie, session, { ...cookieOptions, maxAge: 8 * 3600 });
    return { verified: true, recoveryCodes };
  });
  app.post('/api/auth/login/options', authRate, async (_request, reply) => {
    if (!store.enrolled())
      return reply
        .code(403)
        .send({ message: 'The private workspace needs initial passkey enrollment.' });
    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      userVerification: 'required',
      allowCredentials: store
        .credentials()
        .map((credential) => ({ id: credential.id, transports: credential.transports })),
    });
    const id = store.createChallenge(options.challenge, 'login');
    reply.setCookie(challengeCookie, id, { ...cookieOptions, maxAge: 120 });
    return options;
  });
  app.post('/api/auth/login/verify', authRate, async (request, reply) => {
    const challenge = store.takeChallenge(request.cookies[challengeCookie], 'login');
    reply.clearCookie(challengeCookie, cookieOptions);
    const { response } = z
      .object({ response: z.record(z.string(), z.unknown()) })
      .parse(request.body);
    const credential = store.credentials().find((credential) => credential.id === response.id);
    if (!challenge || !credential)
      return reply
        .code(400)
        .send({ message: 'The passkey request is invalid, expired or already used.' });
    const verification = await verifyAuthenticationResponse({
      response: response as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential,
      requireUserVerification: true,
    });
    if (!verification.verified)
      return reply.code(400).send({ message: 'The passkey could not be verified.' });
    store.updateCounter(credential.id, verification.authenticationInfo.newCounter);
    store.revoke(request.cookies[sessionCookie]);
    reply.setCookie(sessionCookie, store.createSession(), { ...cookieOptions, maxAge: 8 * 3600 });
    return { verified: true };
  });
  app.post('/api/auth/recover', authRate, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(1).max(80) }).parse(request.body);
    if (!store.consumeRecoveryCode(code))
      return reply
        .code(400)
        .send({ message: 'The recovery code is invalid or has already been used.' });
    store.revoke(request.cookies[sessionCookie]);
    reply.setCookie(sessionCookie, store.createSession(true), { ...cookieOptions, maxAge: 600 });
    return { recovered: true, nextStep: 'Register a replacement passkey within ten minutes.' };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    store.revoke(request.cookies[sessionCookie]);
    reply.clearCookie(sessionCookie, cookieOptions);
    return { signedOut: true };
  });
  app.get('/api/workspace', async (_request, reply) => {
    if (!config.reader)
      return reply.code(503).send({
        message:
          'Microsoft credentials are not configured on the private server. Follow the private deployment guide.',
      });
    const results = await Promise.allSettled([
      config.reader.read('alerts'),
      config.reader.read('devices'),
    ]);
    const warnings: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected')
        warnings.push(
          result.reason instanceof UpstreamError
            ? result.reason.message
            : `${i ? 'Device' : 'Alert'} data could not be read. Check server configuration.`,
        );
    }
    if (results.every((result) => result.status === 'rejected'))
      return reply.code(503).send({ message: warnings.join(' ') });
    return {
      mode: 'live',
      fetchedAt: new Date().toISOString(),
      alerts: results[0].status === 'fulfilled' ? results[0].value.map(mapAlert) : [],
      devices: results[1].status === 'fulfilled' ? results[1].value.map(mapDevice) : [],
      warnings,
    };
  });
  app.get<{ Params: { resource: string } }>('/api/records/:resource', async (request, reply) => {
    const resource = request.params.resource;
    if (!Object.hasOwn(resources, resource) || ['alerts', 'devices'].includes(resource))
      return reply
        .code(404)
        .send({ message: 'This data source is not connected. Review the documented coverage.' });
    if (!config.reader)
      return reply.code(503).send({ message: 'Microsoft credentials are not configured.' });
    return { items: (await config.reader.read(resource as Resource)).map(mapRecord) };
  });
  app.all('/api/*', async (_request, reply) =>
    reply.code(404).send({
      message:
        'This API operation does not exist. The workspace has no security mutation endpoints.',
    }),
  );
  const staticPath = resolve(config.staticPath ?? 'dist');
  if (existsSync(staticPath)) await app.register(serveStatic, { root: staticPath });
  app.addHook('onClose', async () => store.close());
  return { app, store };
}
