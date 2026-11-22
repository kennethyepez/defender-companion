import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import {
  digest,
  equalSecret,
  operations,
  Store,
  type ChallengeContext,
  type Operation,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from './store';

export type AuthConfig = { origin: string; rpId: string; bootstrapToken?: string };
export class AuthFailure extends Error {
  statusCode = 403;
}
const responseSchema = z.object({ response: z.record(z.string(), z.unknown()) });
const approvalSchema = z.object({ approval: z.string().min(1).max(128) });
const operationSchema = z.object({
  operation: z.enum(operations),
  target: z.string().max(1024).default(''),
});
export function authNames(secure: boolean) {
  return {
    session: secure ? '__Host-dc-session' : 'dc-session',
    challenge: secure ? '__Host-dc-challenge' : 'dc-challenge',
  };
}

export async function registerAuth(app: FastifyInstance, store: Store, config: AuthConfig) {
  const secure = new URL(config.origin).protocol === 'https:';
  const names = authNames(secure);
  const cookie = { httpOnly: true, sameSite: 'strict' as const, secure, path: '/' };
  const rate = { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } };
  const tokenFor = (request: FastifyRequest) => request.cookies[names.session];
  const requireFull = (request: FastifyRequest) => {
    const token = tokenFor(request);
    const session = store.session(token);
    if (!token || !session || session.recovery)
      throw new AuthFailure('A full passkey session is required.');
    return { token, session };
  };
  const authorize = (request: FastifyRequest, operation: Operation, target = '') => {
    const { token, session } = requireFull(request);
    const { approval } = approvalSchema.parse(request.body);
    const credential = store.consumeApproval(approval, token, operation, target);
    if (!credential) throw new AuthFailure('Verify an existing passkey for this exact action.');
    return { token, session, credential };
  };
  const setSession = (reply: FastifyReply, token: string, recovery = false) => {
    const session = store.session(token)!;
    reply.header('X-Session-Expires-At', String(session.expires));
    reply.header(
      'X-Session-Idle-Expires-At',
      String(Math.min(session.expires, session.lastSeen + SESSION_IDLE_MS)),
    );
    return reply.setCookie(names.session, token, {
      ...cookie,
      maxAge: recovery ? 600 : SESSION_ABSOLUTE_MS / 1000,
    });
  };
  const issueChallenge = (
    reply: FastifyReply,
    challenge: string,
    purpose: 'login' | 'register' | 'step-up',
    context: ChallengeContext = {},
  ) => {
    reply.setCookie(
      names.challenge,
      store.createChallenge(challenge, purpose, Date.now(), context),
      { ...cookie, maxAge: 120 },
    );
  };
  async function verifyAssertion(response: Record<string, unknown>, challenge: string) {
    const credential = store.credential(String(response.id));
    if (!credential) throw new AuthFailure('The credential is not active.');
    const verified = await verifyAuthenticationResponse({
      response: response as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential,
      requireUserVerification: true,
    });
    if (!verified.verified) throw new AuthFailure('The authenticator could not be verified.');
    // Recheck after asynchronous crypto, in case a concurrent request revoked the key.
    if (!store.credential(credential.id))
      throw new AuthFailure('The credential is no longer active.');
    return { credential, counter: verified.authenticationInfo.newCounter };
  }
  const optionsForExisting = () =>
    generateAuthenticationOptions({
      rpID: config.rpId,
      userVerification: 'required',
      allowCredentials: store
        .credentials()
        .map((item) => ({ id: item.id, transports: item.transports })),
    });

  app.get('/api/auth/status', async (request) => {
    const session = store.session(tokenFor(request));
    return {
      enrolled: store.enrolled(),
      authenticated: !!session,
      recovery: session?.recovery ?? false,
      absoluteExpiresAt: session?.expires,
      idleTimeoutMs: SESSION_IDLE_MS,
    };
  });
  app.post('/api/auth/register/options', rate, async (request, reply) => {
    const body = z
      .object({
        token: z.string().max(512).optional(),
        approval: z.string().max(128).optional(),
        label: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .regex(/^[^\u0000-\u001f\u007f]+$/)
          .default('Passkey'),
      })
      .parse(request.body);
    let context: ChallengeContext;
    if (!store.enrolled()) {
      if (!config.bootstrapToken || !body.token || !equalSecret(body.token, config.bootstrapToken))
        throw new AuthFailure('Initial enrollment needs the private setup token.');
      context = { authorization: 'bootstrap' };
    } else {
      const token = tokenFor(request);
      const session = store.session(token);
      if (!token || !session) throw new AuthFailure('Sign in to manage passkeys.');
      if (session.recovery) context = { authorization: 'recovery', sessionHash: digest(token) };
      else {
        const authorizingCredential = store.consumeApproval(
          body.approval,
          token,
          'credential.add',
          body.label,
        );
        if (!authorizingCredential)
          throw new AuthFailure('Verify an existing passkey before adding another.');
        context = { authorization: 'step-up', sessionHash: digest(token), authorizingCredential };
      }
    }
    const options = await generateRegistrationOptions({
      rpName: 'Defender Companion',
      rpID: config.rpId,
      userName: 'workspace-administrator',
      userDisplayName: 'Workspace administrator',
      userID: new Uint8Array(Buffer.from(store.userId(), 'base64url')),
      attestationType: 'none',
      excludeCredentials: store
        .credentials()
        .map((item) => ({ id: item.id, transports: item.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    issueChallenge(reply, options.challenge, 'register', { ...context, target: body.label });
    return options;
  });
  app.post('/api/auth/register/verify', rate, async (request, reply) => {
    const challenge = store.takeChallengeRecord(request.cookies[names.challenge], 'register');
    reply.clearCookie(names.challenge, cookie);
    if (!challenge) throw new AuthFailure('Registration expired or was already used.');
    const token = tokenFor(request);
    const context = challenge.context;
    const checkAuthorization = () => {
      if (context.authorization === 'bootstrap') {
        if (store.enrolled()) throw new AuthFailure('Initial enrollment has already completed.');
        return;
      }
      const session = store.session(token);
      if (!token || !session || context.sessionHash !== digest(token))
        throw new AuthFailure('Registration belongs to a different or expired session.');
      if (
        context.authorization === 'recovery'
          ? !session.recovery
          : session.recovery ||
            !context.authorizingCredential ||
            !store.credential(context.authorizingCredential)
      )
        throw new AuthFailure('Registration is no longer authorized.');
    };
    checkAuthorization();
    const { response } = responseSchema.parse(request.body);
    const verified = await verifyRegistrationResponse({
      response: response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge.value,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    });
    if (!verified.verified || !verified.registrationInfo)
      throw new AuthFailure('The passkey could not be verified.');
    const credential = verified.registrationInfo.credential;
    const result = store.transaction(() => {
      checkAuthorization();
      store.addCredential(credential, context.target ?? 'Passkey');
      const recoveryCodes = store.issueRecoveryCodes(context.authorization === 'recovery');
      if (context.authorization === 'recovery') store.revokeAll();
      else store.revoke(token);
      store.audit('registration', 'success', credential.id, request.ip);
      return { recoveryCodes, token: store.createSession(false, Date.now(), credential.id) };
    });
    setSession(reply, result.token);
    return { verified: true, recoveryCodes: result.recoveryCodes };
  });
  app.post('/api/auth/login/options', rate, async (_request, reply) => {
    if (!store.enrolled()) throw new AuthFailure('Enroll a passkey first.');
    const options = await optionsForExisting();
    issueChallenge(reply, options.challenge, 'login');
    return options;
  });
  app.post('/api/auth/login/verify', rate, async (request, reply) => {
    const challenge = store.takeChallengeRecord(request.cookies[names.challenge], 'login');
    reply.clearCookie(names.challenge, cookie);
    if (!challenge) throw new AuthFailure('The sign-in request expired or was already used.');
    const { response } = responseSchema.parse(request.body);
    const verified = await verifyAssertion(response, challenge.value);
    const token = store.transaction(() => {
      store.updateCounter(verified.credential.id, verified.counter);
      store.revoke(tokenFor(request));
      store.audit('login', 'success', verified.credential.id, request.ip);
      return store.createSession(false, Date.now(), verified.credential.id);
    });
    setSession(reply, token);
    return { verified: true };
  });
  app.post('/api/auth/step-up/options', rate, async (request, reply) => {
    const { token } = requireFull(request);
    const { operation, target } = operationSchema.parse(request.body);
    if (operation === 'credential.revoke' && !store.credential(target))
      throw new AuthFailure('Choose an active passkey.');
    const options = await optionsForExisting();
    issueChallenge(reply, options.challenge, 'step-up', {
      sessionHash: digest(token),
      operation,
      target,
    });
    return options;
  });
  app.post('/api/auth/step-up/verify', rate, async (request, reply) => {
    const { token } = requireFull(request);
    const challenge = store.takeChallengeRecord(request.cookies[names.challenge], 'step-up');
    reply.clearCookie(names.challenge, cookie);
    if (
      !challenge ||
      challenge.context.sessionHash !== digest(token) ||
      !challenge.context.operation
    )
      throw new AuthFailure('This verification is expired or belongs to another session.');
    const { response } = responseSchema.parse(request.body);
    const verified = await verifyAssertion(response, challenge.value);
    const approval = store.transaction(() => {
      requireFull(request);
      store.updateCounter(verified.credential.id, verified.counter);
      store.audit('step-up', 'success', verified.credential.id, request.ip);
      return store.createApproval(
        token,
        challenge.context.operation!,
        challenge.context.target ?? '',
        verified.credential.id,
      );
    });
    return { approval, expiresInSeconds: 60 };
  });
  app.post('/api/auth/recover', rate, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(1).max(80) }).parse(request.body);
    const token = store.transaction(() => {
      if (!store.consumeRecoveryCode(code))
        throw new AuthFailure('The recovery code is invalid or was already used.');
      store.revokeAll();
      store.audit('recovery', 'success', '', request.ip);
      return store.createSession(true);
    });
    setSession(reply, token, true);
    return {
      recovered: true,
      nextStep:
        'Register a replacement passkey within ten minutes. Existing passkeys are preserved; recovery codes will rotate after registration.',
    };
  });
  app.get('/api/auth/security', async (request) => {
    const { token, session } = requireFull(request);
    return {
      credentials: store.credentialList(session.credentialId),
      sessions: store.listSessions(token),
      recoveryCodesRemaining: store.recoveryCount(),
      audit: store.auditEntries(),
      sessionPolicy: { idleMs: SESSION_IDLE_MS, absoluteMs: SESSION_ABSOLUTE_MS },
    };
  });
  app.post('/api/auth/credentials/revoke', rate, async (request, reply) => {
    const { target } = z.object({ target: z.string().min(1).max(1024) }).parse(request.body);
    const auth = authorize(request, 'credential.revoke', target);
    store.transaction(() => {
      if (!store.revokeCredential(target))
        throw new AuthFailure('Keep at least one working passkey.');
      store.audit('credential-revocation', 'success', auth.credential, request.ip);
    });
    const signedOut = !store.session(auth.token);
    if (signedOut) reply.clearCookie(names.session, cookie);
    return { revoked: true, signedOut };
  });
  app.post('/api/auth/sessions/revoke-all', rate, async (request, reply) => {
    const auth = authorize(request, 'sessions.revoke');
    store.transaction(() => {
      store.revokeAll();
      store.audit('session-revocation', 'success', auth.credential, request.ip);
    });
    reply.clearCookie(names.session, cookie);
    return { signedOut: true };
  });
  app.post('/api/auth/recovery/rotate', rate, async (request, reply) => {
    const auth = authorize(request, 'recovery.rotate');
    const result = store.transaction(() => {
      const recoveryCodes = store.issueRecoveryCodes(true);
      store.revokeAll();
      store.audit('recovery-rotation', 'success', auth.credential, request.ip);
      return { recoveryCodes, token: store.createSession(false, Date.now(), auth.credential) };
    });
    setSession(reply, result.token);
    return { recoveryCodes: result.recoveryCodes };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    store.revoke(tokenFor(request));
    store.audit('logout', 'success', '', request.ip);
    reply.clearCookie(names.session, cookie);
    return { signedOut: true };
  });
}
