import { boundHeaders } from './helpers/binding';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../server/app';
import { TestAuthenticator } from './helpers/test-authenticator';
import { workspace } from './helpers/workspace';
import type { Operation } from '../server/store';
const origin = 'http://localhost:4318';
const setup = 'test-only-private-bootstrap-32-characters-long';
let instance: Awaited<ReturnType<typeof buildApp>>;
let owner: TestAuthenticator;
let session: string;
let counter: number;
let binding: string;
const cookies = (response: LightMyRequestResponse) =>
  response.cookies
    .filter((item) => item.value)
    .map((item) => `${item.name}=${item.value}`)
    .join('; ');
const post = (url: string, payload: object, cookie = session) =>
  instance.app.inject({
    method: 'POST',
    url: '/api/auth/' + url,
    headers: { origin, ...boundHeaders(instance.store, cookie) },
    payload,
  });
async function enroll(key: TestAuthenticator, cookie = '', approval?: string) {
  const options = await post(
    'register/options',
    { token: setup, label: 'Passkey', approval },
    cookie,
  );
  expect(options.statusCode).toBe(200);
  return post(
    'register/verify',
    { response: key.registration(options.json().challenge, origin, 'localhost') },
    [cookie, cookies(options)].filter(Boolean).join('; '),
  );
}
async function approval(operation: Operation, target = '', cookie = session, key = owner) {
  const options = await post('step-up/options', { operation, target }, cookie);
  expect(options.statusCode).toBe(200);
  const result = await post(
    'step-up/verify',
    {
      response: key.authentication(
        options.json().challenge,
        origin,
        'localhost',
        ++counter,
        instance.store.userId(),
      ),
    },
    [cookie, cookies(options)].join('; '),
  );
  expect(result.statusCode).toBe(200);
  return result.json().approval as string;
}
beforeEach(async () => {
  instance = await buildApp({
    origin,
    rpId: 'localhost',
    bootstrapToken: setup,
    databasePath: ':memory:',
    source: { read: async () => workspace() },
  });
  owner = new TestAuthenticator();
  counter = 0;
  const first = await enroll(owner);
  expect(first.statusCode).toBe(200);
  session = cookies(first);
  binding = String(first.headers['x-workspace-binding']);
});
afterEach(async () => instance.app.close());
describe('security-sensitive actions', () => {
  it('denies a cookie copied by another port without the in-memory browser binding', async () => {
    const token = session.match(/dc-session=([^;]+)/)![1];
    const before = instance.store.session(token, Date.now(), false)!.lastSeen;
    expect(binding).toMatch(/^[a-f0-9]{64}$/);
    const status = await instance.app.inject({
      url: '/api/auth/status',
      headers: { cookie: session },
    });
    expect(status.json().authenticated).toBe(false);
    expect(status.headers['x-workspace-binding']).toBeUndefined();
    expect(
      (await instance.app.inject({ url: '/api/workspace', headers: { cookie: session } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await instance.app.inject({ url: '/api/auth/security', headers: { cookie: session } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await instance.app.inject({
          method: 'POST',
          url: '/api/auth/step-up/options',
          headers: { origin, cookie: session },
          payload: { operation: 'sessions.revoke' },
        })
      ).statusCode,
    ).toBe(403);
    expect(instance.store.session(token, Date.now(), false)!.lastSeen).toBe(before);
    const other = instance.store.createSession(false, Date.now(), owner.id);
    expect(
      (
        await instance.app.inject({
          url: '/api/workspace',
          headers: { cookie: session, 'x-workspace-binding': instance.store.browserBinding(other) },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await instance.app.inject({
          url: '/api/workspace',
          headers: { cookie: session, 'x-workspace-binding': binding },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('blocks the exact stolen-session enrollment regression', async () => {
    const result = await post('register/options', {});
    expect(result.statusCode).toBe(403);
    expect(instance.store.credentials()).toHaveLength(1);
    expect(
      instance.store
        .auditEntries()
        .some((row) => row.kind === 'registration' && row.outcome === 'denied'),
    ).toBe(true);
  });
  it('rejects a step-up signed by an unregistered authenticator', async () => {
    const options = await post('step-up/options', {
      operation: 'credential.add',
      target: 'Passkey',
    });
    const rogue = new TestAuthenticator();
    const result = await post(
      'step-up/verify',
      {
        response: rogue.authentication(
          options.json().challenge,
          origin,
          'localhost',
          1,
          instance.store.userId(),
        ),
      },
      [session, cookies(options)].join('; '),
    );
    expect(result.statusCode).toBe(403);
    expect(instance.store.credentials()).toHaveLength(1);
  });
  it('allows a new passkey only after action-bound proof with an existing one', async () => {
    const grant = await approval('credential.add', 'Passkey');
    const result = await enroll(new TestAuthenticator(), session, grant);
    expect(result.statusCode).toBe(200);
    expect(instance.store.credentials()).toHaveLength(2);
    const again = await post(
      'register/options',
      { approval: grant, label: 'Passkey' },
      cookies(result),
    );
    expect(again.statusCode).toBe(403);
  });
  it('rejects approval reuse for another operation or session', async () => {
    const grant = await approval('credential.add', 'Passkey');
    const wrongAction = await post('sessions/revoke-all', { approval: grant });
    expect(wrongAction.statusCode).toBe(403);
    const newGrant = await approval('credential.add', 'Passkey');
    const second = `dc-session=${instance.store.createSession(false, Date.now(), owner.id)}`;
    expect(
      (await post('register/options', { approval: newGrant, label: 'Passkey' }, second)).statusCode,
    ).toBe(403);
  });
  it('binds registration verification to the session that requested it', async () => {
    const grant = await approval('credential.add', 'Passkey');
    const options = await post('register/options', { approval: grant, label: 'Passkey' });
    const second = `dc-session=${instance.store.createSession(false, Date.now(), owner.id)}`;
    const replacement = new TestAuthenticator();
    const result = await post(
      'register/verify',
      { response: replacement.registration(options.json().challenge, origin, 'localhost') },
      [second, cookies(options)].join('; '),
    );
    expect(result.statusCode).toBe(403);
    expect(instance.store.credentials()).toHaveLength(1);
  });
  it('does not permit removing the last active passkey', async () => {
    const grant = await approval('credential.revoke', owner.id);
    expect(
      (await post('credentials/revoke', { target: owner.id, approval: grant })).statusCode,
    ).toBe(403);
    expect(instance.store.credentials()).toHaveLength(1);
  });
  it('revokes a selected credential and its sessions only after fresh proof', async () => {
    const replacement = new TestAuthenticator();
    const enrolled = await enroll(
      replacement,
      session,
      await approval('credential.add', 'Passkey'),
    );
    session = cookies(enrolled);
    const oldSession = instance.store.createSession(false, Date.now(), owner.id);
    expect((await post('credentials/revoke', { target: owner.id })).statusCode).toBe(400);
    const grant = await approval('credential.revoke', owner.id, session, replacement);
    const result = await post('credentials/revoke', { target: owner.id, approval: grant });
    expect(result.statusCode).toBe(200);
    expect(instance.store.credential(owner.id)).toBeUndefined();
    expect(instance.store.session(oldSession)).toBeUndefined();
    expect(instance.store.credential(replacement.id)).toBeDefined();
  });
  it('invalidates all sessions and pending approvals after verified sign-out everywhere', async () => {
    const other = instance.store.createSession(false, Date.now(), owner.id);
    const grant = await approval('sessions.revoke');
    const pending = await approval('credential.add', 'Passkey');
    expect((await post('sessions/revoke-all', { approval: grant })).statusCode).toBe(200);
    expect(instance.store.session(other)).toBeUndefined();
    expect(
      instance.store.consumeApproval(
        pending,
        session.split('=').slice(1).join('='),
        'credential.add',
        'Passkey',
      ),
    ).toBeUndefined();
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: boundHeaders(instance.store, session),
        })
      ).statusCode,
    ).toBe(401);
  });
  it('requires proof before rotating recovery codes and invalidates the old set', async () => {
    const initial = instance.store.issueRecoveryCodes(true);
    const other = instance.store.createSession(false, Date.now(), owner.id);
    expect((await post('recovery/rotate', {})).statusCode).toBe(400);
    const grant = await approval('recovery.rotate');
    const result = await post('recovery/rotate', { approval: grant });
    expect(result.statusCode).toBe(200);
    expect(result.json().recoveryCodes).toHaveLength(10);
    expect(instance.store.consumeRecoveryCode(initial[0])).toBe(false);
    expect(instance.store.session(other)).toBeUndefined();
    const logs = JSON.stringify(instance.store.auditEntries());
    expect(logs).not.toContain(result.json().recoveryCodes[0]);
    expect(logs).not.toContain(owner.id);
  });
  it('recovery revokes old sessions immediately and stays limited until replacement', async () => {
    const codes = instance.store.issueRecoveryCodes(true);
    const old = session;
    const result = await post('recover', { code: codes[0] }, '');
    expect(result.statusCode).toBe(200);
    const recovered = cookies(result);
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: { cookie: old },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/auth/security',
          headers: boundHeaders(instance.store, recovered),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await post('step-up/options', { operation: 'sessions.revoke' }, recovered)).statusCode,
    ).toBe(403);
    const replaced = await enroll(new TestAuthenticator(), recovered);
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().recoveryCodes).toHaveLength(10);
    expect(instance.store.consumeRecoveryCode(codes[1])).toBe(false);
    expect(instance.store.credentials()).toHaveLength(2);
  });
});

it('serializes competing initial enrollments without admitting a second administrator credential', async () => {
  const fresh = await buildApp({
    origin,
    rpId: 'localhost',
    bootstrapToken: setup,
    databasePath: ':memory:',
  });
  try {
    const begin = () =>
      fresh.app.inject({
        method: 'POST',
        url: '/api/auth/register/options',
        headers: { origin },
        payload: { token: setup },
      });
    const [one, two] = await Promise.all([begin(), begin()]);
    const verify = (options: LightMyRequestResponse, key: TestAuthenticator) =>
      fresh.app.inject({
        method: 'POST',
        url: '/api/auth/register/verify',
        headers: { origin, cookie: cookies(options) },
        payload: { response: key.registration(options.json().challenge, origin, 'localhost') },
      });
    const results = await Promise.all([
      verify(one, new TestAuthenticator()),
      verify(two, new TestAuthenticator()),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 403]);
    expect(fresh.store.credentials()).toHaveLength(1);
  } finally {
    await fresh.app.close();
  }
});
