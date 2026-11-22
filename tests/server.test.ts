import { boundHeaders } from './helpers/binding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../server/app';
import { workspace } from './helpers/workspace';
const origin = 'http://localhost:4318';
let instance: Awaited<ReturnType<typeof buildApp>>;
const source = { read: vi.fn(async () => workspace()) };
beforeEach(async () => {
  source.read.mockReset().mockResolvedValue(workspace());
  instance = await buildApp({
    origin,
    rpId: 'localhost',
    databasePath: ':memory:',
    bootstrapToken: 'test-bootstrap-token-with-at-least-32-characters',
    source,
  });
  instance.store.addCredential({
    id: 'boundary-test-key',
    publicKey: new Uint8Array([1, 2]),
    counter: 0,
  });
});
afterEach(async () => instance.app.close());
const cookie = () =>
  `dc-session=${instance.store.createSession(false, Date.now(), 'boundary-test-key')}`;
describe('private boundary', () => {
  it('requires authentication before reading any workspace data', async () => {
    for (const url of ['/api/workspace', '/api/records/software'])
      expect((await instance.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect(source.read).not.toHaveBeenCalled();
  });
  it('denies absent or foreign origins on auth changes', async () => {
    for (const value of [undefined, 'https://attacker.invalid'])
      expect(
        (
          await instance.app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: value ? { origin: value } : {},
          })
        ).statusCode,
      ).toBe(403);
  });
  it('denies security mutation routes even for a signed-in reader', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE'] as const)
      expect(
        (
          await instance.app.inject({
            method,
            url: '/api/alerts/123/close',
            headers: { origin, ...boundHeaders(instance.store, cookie()) },
          })
        ).statusCode,
      ).toBe(404);
    expect(source.read).not.toHaveBeenCalled();
  });
  it('does not give a recovery session access to tenant data', async () => {
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: boundHeaders(instance.store, `dc-session=${instance.store.createSession(true)}`),
        })
      ).statusCode,
    ).toBe(401);
  });
  it('never substitutes fictional data when the handoff fails', async () => {
    source.read.mockRejectedValue(new Error('SECRET-source-details'));
    const response = await instance.app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: boundHeaders(instance.store, cookie()),
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('SECRET');
    expect(response.body).not.toContain('Atlas');
  });
  it('returns source freshness unchanged and prevents browser caching', async () => {
    const value = workspace();
    value.freshness.state = 'stale';
    source.read.mockResolvedValue(value);
    const result = await instance.app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: boundHeaders(instance.store, cookie()),
    });
    expect(result.json().freshness.state).toBe('stale');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-session-expires-at']).toBeDefined();
  });
  it('revokes the current session on logout', async () => {
    const session = cookie();
    await instance.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin, ...boundHeaders(instance.store, session) },
    });
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
  it('does not expand alert-only coverage', async () => {
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/records/entities',
          headers: boundHeaders(instance.store, cookie()),
        })
      ).statusCode,
    ).toBe(404);
    expect(source.read).not.toHaveBeenCalled();
  });
  it('exports only counts and times after explicit confirmation', async () => {
    const headers = { origin, ...boundHeaders(instance.store, cookie()) };
    expect(
      (
        await instance.app.inject({
          method: 'POST',
          url: '/api/workspace/export',
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/workspace/export',
      headers,
      payload: { confirm: true },
    });
    expect(result.statusCode).toBe(200);
    for (const secret of ['Atlas', 'alert-001', 'evidence', 'localReviews'])
      expect(result.body).not.toContain(secret);
    expect(instance.store.auditEntries().some((row) => row.kind === 'workspace-export')).toBe(true);
  });
  it('rejects insecure deployment origins and mismatched RP IDs', async () => {
    await expect(
      buildApp({ origin: 'http://example.com', rpId: 'example.com', databasePath: ':memory:' }),
    ).rejects.toThrow('localhost');
    await expect(
      buildApp({ origin: 'https://example.com', rpId: 'different.com', databasePath: ':memory:' }),
    ).rejects.toThrow('RP ID');
  });
});
