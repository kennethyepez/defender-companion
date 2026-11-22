import { boundHeaders } from './helpers/binding';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../server/app';
import { TestAuthenticator } from './helpers/test-authenticator';
import { workspace } from './helpers/workspace';
const origin = 'http://localhost:4318';
const token = 'test-only-bootstrap-token-with-32-characters';
let instance: Awaited<ReturnType<typeof buildApp>>;
const cookies = (response: LightMyRequestResponse) =>
  response.cookies
    .filter((cookie) => cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
beforeEach(async () => {
  instance = await buildApp({
    origin,
    rpId: 'localhost',
    bootstrapToken: token,
    databasePath: ':memory:',
    source: { read: async () => workspace() },
  });
});
afterEach(async () => instance.app.close());
async function register(authenticator: TestAuthenticator, session = '') {
  const options = await instance.app.inject({
    method: 'POST',
    url: '/api/auth/register/options',
    headers: { origin, ...boundHeaders(instance.store, session) },
    payload: { token },
  });
  expect(options.statusCode).toBe(200);
  return instance.app.inject({
    method: 'POST',
    url: '/api/auth/register/verify',
    headers: {
      origin,
      ...boundHeaders(instance.store, [session, cookies(options)].filter(Boolean).join('; ')),
    },
    payload: {
      response: authenticator.registration(options.json().challenge, origin, 'localhost'),
    },
  });
}
async function loginOptions() {
  const result = await instance.app.inject({
    method: 'POST',
    url: '/api/auth/login/options',
    headers: { origin },
    payload: {},
  });
  expect(result.statusCode).toBe(200);
  return result;
}
describe('real WebAuthn verification through HTTP routes', () => {
  it('registers a valid credential, verifies an actual ECDSA signature and revokes the session', async () => {
    const authenticator = new TestAuthenticator();
    const enrolled = await register(authenticator);
    expect(enrolled.statusCode).toBe(200);
    expect(enrolled.json().recoveryCodes).toHaveLength(10);
    expect(instance.store.credentials()).toHaveLength(1);
    const options = await loginOptions();
    const signed = authenticator.authentication(
      options.json().challenge,
      origin,
      'localhost',
      1,
      instance.store.userId(),
    );
    const request = {
      method: 'POST' as const,
      url: '/api/auth/login/verify',
      headers: { origin, cookie: cookies(options) },
      payload: { response: signed },
    };
    const verified = await instance.app.inject(request);
    expect(verified.statusCode).toBe(200);
    expect(verified.json().verified).toBe(true);
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: boundHeaders(instance.store, cookies(verified)),
        })
      ).statusCode,
    ).toBe(200);
    expect([400, 403]).toContain((await instance.app.inject(request)).statusCode);
    await instance.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin, cookie: cookies(verified) },
    });
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: boundHeaders(instance.store, cookies(verified)),
        })
      ).statusCode,
    ).toBe(401);
  });
  it.each(['wrong-origin', 'wrong-rp', 'no-user-verification', 'tampered-signature'])(
    'rejects a validly structured %s assertion',
    async (fault) => {
      const authenticator = new TestAuthenticator();
      expect((await register(authenticator)).statusCode).toBe(200);
      const options = await loginOptions();
      const response = authenticator.authentication(
        options.json().challenge,
        fault === 'wrong-origin' ? 'https://attacker.invalid' : origin,
        fault === 'wrong-rp' ? 'attacker.invalid' : 'localhost',
        1,
        instance.store.userId(),
        fault !== 'no-user-verification',
      );
      if (fault === 'tampered-signature')
        response.response.signature = Buffer.from('invalid-signature').toString('base64url');
      const result = await instance.app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        headers: { origin, cookie: cookies(options) },
        payload: { response },
      });
      expect([400, 403]).toContain(result.statusCode);
    },
  );
  it('recovers with a one-use code, adds a replacement passkey and preserves original credentials', async () => {
    const original = new TestAuthenticator();
    const enrolled = await register(original);
    const code = enrolled.json().recoveryCodes[0] as string;
    const recovered = await instance.app.inject({
      method: 'POST',
      url: '/api/auth/recover',
      headers: { origin },
      payload: { code },
    });
    expect(recovered.statusCode).toBe(200);
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: boundHeaders(instance.store, cookies(recovered)),
        })
      ).statusCode,
    ).toBe(401);
    const replacement = new TestAuthenticator();
    const replaced = await register(replacement, cookies(recovered));
    expect(replaced.statusCode).toBe(200);
    expect(instance.store.credentials()).toHaveLength(2);
    expect(replaced.json().recoveryCodes).toHaveLength(10);
    expect(
      (
        await instance.app.inject({
          method: 'POST',
          url: '/api/auth/recover',
          headers: { origin },
          payload: { code },
        })
      ).statusCode,
    ).toBe(403);
    const options = await loginOptions();
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/auth/login/verify',
      headers: { origin, cookie: cookies(options) },
      payload: {
        response: replacement.authentication(
          options.json().challenge,
          origin,
          'localhost',
          1,
          instance.store.userId(),
        ),
      },
    });
    expect(result.statusCode).toBe(200);
    expect(instance.store.credentials().some((credential) => credential.id === original.id)).toBe(
      true,
    );
  });
});
