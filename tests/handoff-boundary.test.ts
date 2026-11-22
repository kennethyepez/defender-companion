import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../server/app';
import { HandoffReader, handoffDataset, MAX_SNAPSHOT_AGE_MS } from '../server/handoff';
import { validateServiceIdentity } from '../server/isolation';
import { workspace } from './helpers/workspace';
const now = Date.now();
function handoff() {
  const data = workspace();
  return {
    format: 'defender-companion-handoff-v1',
    lastSuccessfulReadAt: new Date(now).toISOString(),
    lastAttemptAt: new Date(now).toISOString(),
    outcome: 'ok',
    alerts: data.alerts.slice(0, 1).map((a) => ({
      ...a,
      id: 'a-' + 'a'.repeat(24),
      deviceId: 'd-' + 'b'.repeat(24),
      category: 'Credential access',
      title: 'PRIVATE COMMAND',
      description: 'PRIVATE PATH',
      evidence: a.evidence.slice(0, 1).map((e) => ({
        ...e,
        id: 'e-' + 'c'.repeat(24),
        verdict: 'unknown',
        name: 'PRIVATE ACCOUNT',
        detail: 'PRIVATE SECRET',
      })),
    })),
    devices: data.devices.slice(0, 1).map((d) => ({
      ...d,
      id: 'd-' + 'b'.repeat(24),
      name: 'test-device',
      os: 'Windows',
      ip: 'PRIVATE IP',
    })),
  };
}
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
describe('credential-free handoff', () => {
  it('whitelists sensitive strings again at consumption', () => {
    const data = handoffDataset(handoff(), now);
    expect(JSON.stringify(data)).not.toContain('PRIVATE');
    expect(data.freshness?.state).toBe('fresh');
    expect(data.devices[0].lastSeen).toBe('');
  });
  it('never presents stale or failed collection as fresh', () => {
    expect(handoffDataset(handoff(), now + MAX_SNAPSHOT_AGE_MS + 1).freshness?.state).toBe('stale');
    expect(handoffDataset({ ...handoff(), outcome: 'failed' }, now).freshness?.state).toBe(
      'unavailable',
    );
    expect(() =>
      handoffDataset(
        { ...handoff(), lastSuccessfulReadAt: new Date(now + 120000).toISOString() },
        now,
      ),
    ).toThrow();
    expect(() =>
      handoffDataset({ ...handoff(), lastAttemptAt: new Date(now - 1).toISOString() }, now),
    ).toThrow();
  });
  it('rejects unknown fields carrying executable evidence and unsafe links', () => {
    const value = handoff();
    value.alerts[0].category = 'PRIVATE SECRET';
    expect(() => handoffDataset(value)).toThrow();
    const link = {
      ...handoff(),
      alerts: handoff().alerts.map((a) => ({ ...a, sourceUrl: 'https://attacker.invalid/' })),
    };
    expect(() => handoffDataset(link)).toThrow();
  });
  it('reads only a bounded regular local file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'companion-handoff-'));
    directories.push(directory);
    const file = join(directory, 'workspace.json');
    await writeFile(file, JSON.stringify(handoff()));
    expect((await new HandoffReader(file).read()).mode).toBe('live');
    await writeFile(file, 'x'.repeat(1000001));
    await expect(new HandoffReader(file).read()).rejects.toThrow();
    await writeFile(file, '{');
    await expect(new HandoffReader(file).read()).rejects.toThrow();
  });
  it.skipIf(process.platform === 'win32')('rejects symlinks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'companion-handoff-'));
    directories.push(directory);
    const file = join(directory, 'workspace.json');
    await writeFile(file, JSON.stringify(handoff()));
    const link = join(directory, 'link.json');
    await symlink(file, link);
    await expect(new HandoffReader(link).read()).rejects.toThrow();
  });
});
describe('private transport and identity', () => {
  it('requires approved Serve identity, matching host and direct loopback peer', async () => {
    const origin = 'https://workspace.example.ts.net';
    const instance = await buildApp({
      origin,
      rpId: 'workspace.example.ts.net',
      databasePath: ':memory:',
      boundary: { mode: 'tailnet', allowedLogins: ['operator@example.com'] },
    });
    try {
      for (const [remoteAddress, headers] of [
        ['127.0.0.1', { host: 'workspace.example.ts.net' }],
        [
          '127.0.0.1',
          { host: 'workspace.example.ts.net', 'tailscale-user-login': 'other@example.com' },
        ],
        ['127.0.0.1', { host: 'foreign.ts.net', 'tailscale-user-login': 'operator@example.com' }],
        [
          '192.0.2.10',
          { host: 'workspace.example.ts.net', 'tailscale-user-login': 'operator@example.com' },
        ],
      ] as const)
        expect(
          (await instance.app.inject({ url: '/api/auth/status', remoteAddress, headers }))
            .statusCode,
        ).toBe(403);
      const response = await instance.app.inject({
        url: '/api/auth/status',
        headers: {
          host: 'workspace.example.ts.net',
          'tailscale-user-login': 'operator@example.com',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      await instance.app.close();
    }
  });
  it('rejects public origins, empty identity lists and privileged service accounts', async () => {
    await expect(
      buildApp({
        origin: 'https://public.example',
        rpId: 'public.example',
        databasePath: ':memory:',
        boundary: { mode: 'tailnet', allowedLogins: ['operator@example.com'] },
      }),
    ).rejects.toThrow();
    await expect(
      buildApp({
        origin: 'https://a.ts.net',
        rpId: 'a.ts.net',
        databasePath: ':memory:',
        boundary: { mode: 'tailnet', allowedLogins: [] },
      }),
    ).rejects.toThrow();
    const sid = 'S-1-5-80-1-2-3-4-5';
    expect(() => validateServiceIdentity('win32', sid, sid)).not.toThrow();
    expect(() => validateServiceIdentity('win32', sid, sid, 'S-1-5-32-544')).toThrow();
    expect(() => validateServiceIdentity('win32', sid, 'S-1-5-18')).toThrow();
    expect(() => validateServiceIdentity('linux', '0', '0')).toThrow();
    expect(() => validateServiceIdentity('linux', '1001', '1001')).not.toThrow();
  });
});
