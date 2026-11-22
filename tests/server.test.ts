import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../server/app';
import { UpstreamError, type Resource } from '../server/microsoft';

const origin = 'http://localhost:4318';
let instance: Awaited<ReturnType<typeof buildApp>>;
const reader = { read: vi.fn(async (_resource: Resource) => [] as Record<string, unknown>[]) };
beforeEach(async () => {
  reader.read.mockReset().mockResolvedValue([]);
  instance = await buildApp({
    origin,
    rpId: 'localhost',
    databasePath: ':memory:',
    bootstrapToken: 'test-bootstrap-token-with-at-least-32-characters',
    reader,
  });
});
afterEach(async () => {
  await instance.app.close();
});
function cookie() {
  return `dc-session=${instance.store.createSession()}`;
}
describe('private boundary', () => {
  it('requires authentication before reading any workspace data', async () => {
    for (const url of ['/api/workspace', '/api/records/software'])
      expect((await instance.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('rejects foreign or absent origins for state-changing auth requests', async () => {
    for (const malicious of ['https://attacker.invalid', undefined])
      expect(
        (
          await instance.app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: malicious ? { origin: malicious } : {},
          })
        ).statusCode,
      ).toBe(403);
  });
  it('rejects invalid bootstrap, replayed challenge and forged credential responses', async () => {
    expect(
      (
        await instance.app.inject({
          method: 'POST',
          url: '/api/auth/register/options',
          headers: { origin },
          payload: { token: 'wrong' },
        })
      ).statusCode,
    ).toBe(403);
    const options = await instance.app.inject({
      method: 'POST',
      url: '/api/auth/register/options',
      headers: { origin },
      payload: { token: 'test-bootstrap-token-with-at-least-32-characters' },
    });
    expect(options.statusCode).toBe(200);
    expect(options.json().authenticatorSelection.userVerification).toBe('required');
    const challenge = options.cookies[0];
    expect(challenge.httpOnly).toBe(true);
    expect(challenge.sameSite).toBe('Strict');
    const request = {
      method: 'POST' as const,
      url: '/api/auth/register/verify',
      headers: { origin, cookie: `${challenge.name}=${challenge.value}` },
      payload: { response: { id: 'forged' } },
    };
    expect((await instance.app.inject(request)).statusCode).toBe(400);
    expect((await instance.app.inject(request)).statusCode).toBe(400);
    expect(instance.store.enrolled()).toBe(false);
  });
  it('rejects mutation routes even for an authenticated reader', async () => {
    const headers = { origin, cookie: cookie() };
    for (const method of ['POST', 'PATCH', 'DELETE'] as const)
      expect(
        (await instance.app.inject({ method, url: '/api/alerts/123/close', headers })).statusCode,
      ).toBe(404);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('does not permit a recovery-only session to read tenant data', async () => {
    const token = instance.store.createSession(true);
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: { cookie: `dc-session=${token}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('preserves partial failures as warnings instead of presenting healthy devices', async () => {
    reader.read.mockImplementation(async (resource) => {
      if (resource === 'devices')
        throw new UpstreamError(403, 'Device reading permission required.');
      return [{ id: 'sample', title: 'Review', severity: 'high', status: 'new', evidence: [] }];
    });
    const response = await instance.app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: { cookie: cookie() },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().devices).toEqual([]);
    expect(response.json().warnings).toEqual(['Device reading permission required.']);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('revokes the session on logout', async () => {
    const token = cookie();
    await instance.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin, cookie: token },
    });
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/workspace',
          headers: { cookie: token },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('denies unexpected record paths without fetching upstream', async () => {
    expect(
      (
        await instance.app.inject({
          method: 'GET',
          url: '/api/records/entities',
          headers: { cookie: cookie() },
        })
      ).statusCode,
    ).toBe(404);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('requires a secure stable origin and matching RP ID', async () => {
    await expect(
      buildApp({ origin: 'http://example.com', rpId: 'example.com', databasePath: ':memory:' }),
    ).rejects.toThrow('HTTPS');
    await expect(
      buildApp({ origin: 'https://example.com', rpId: 'different.com', databasePath: ':memory:' }),
    ).rejects.toThrow('RP ID');
  });
});
