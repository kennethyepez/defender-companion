import { describe, expect, it, vi } from 'vitest';
import { MicrosoftReader, mapAlert, mapDevice, validateNextLink } from '../server/microsoft';
const credentials = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  clientId: '00000000-0000-4000-8000-000000000002',
  clientSecret: 'fictional-test-only-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('Microsoft read adapter', () => {
  it('follows same-resource pagination, caches reads and sends only GET to security APIs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ access_token: 'test-only-token', expires_in: 3600 }))
      .mockResolvedValueOnce(
        json({
          value: [{ id: 'one' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/security/alerts_v2?$skip=100',
        }),
      )
      .mockResolvedValueOnce(json({ value: [{ id: 'two' }] }));
    const reader = new MicrosoftReader(credentials, fetcher);
    expect(await reader.read('alerts')).toEqual([{ id: 'one' }, { id: 'two' }]);
    await reader.read('alerts');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls
        .slice(1)
        .every(([, init]) => init?.method === 'GET' && init.redirect === 'error'),
    ).toBe(true);
    expect(fetcher.mock.calls[0][1]?.body?.toString()).toContain(
      'https%3A%2F%2Fgraph.microsoft.com%2F.default',
    );
  });
  it('rejects pagination to another host, protocol, API path or embedded credentials', () => {
    for (const link of [
      'https://attacker.invalid/v1.0/security/alerts_v2',
      'http://graph.microsoft.com/v1.0/security/alerts_v2',
      'https://graph.microsoft.com/v1.0/users',
      'https://user:pass@graph.microsoft.com/v1.0/security/alerts_v2',
    ])
      expect(() => validateNextLink(link, 'graph', '/v1.0/security/alerts_v2')).toThrow();
  });
  it('bounds pagination loops', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ access_token: 'test', expires_in: 3600 }))
      .mockResolvedValue(
        json({
          value: [],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/security/alerts_v2?$top=100',
        }),
      );
    await expect(new MicrosoftReader(credentials, fetcher).read('alerts')).rejects.toThrow(
      'bounded snapshot',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reports missing permissions and never exposes token response contents', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ access_token: 'test', expires_in: 3600 }))
      .mockResolvedValueOnce(json({ error: { message: 'sensitive-upstream-detail' } }, 403));
    await expect(new MicrosoftReader(credentials, fetcher).read('alerts')).rejects.toThrow(
      'SecurityAlert.Read.All',
    );
    const denied = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error_description: 'private-detail' }, 400));
    await expect(new MicrosoftReader(credentials, denied).read('alerts')).rejects.toThrow(
      'Microsoft authentication failed',
    );
  });
  it('does not invent protection or isolation status and keeps untrusted evidence inert', () => {
    const device = mapDevice({ id: 'one', computerDnsName: 'test', riskScore: 'High' });
    expect(device.isolation).toBe('unknown');
    expect(device.protection).toContain('Not reported');
    const alert = mapAlert({
      id: 'one',
      title: '<script>invalid()</script>',
      evidence: [
        {
          '@odata.type': '#microsoft.graph.security.processEvidence',
          processCommandLine: 'do-not-run',
          verdict: 'suspicious',
        },
      ],
    });
    expect(alert.evidence[0].detail).toBe('do-not-run');
    expect(alert.title).toContain('<script>');
  });
});
