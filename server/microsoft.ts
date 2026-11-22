import { z } from 'zod';
import type { Alert, Device, RecordItem } from '../src/domain';

type Fetcher = typeof fetch;
type Provider = 'graph' | 'mde';
type Credentials = { tenantId: string; clientId: string; clientSecret: string };
const cloud = {
  graph: { origin: 'https://graph.microsoft.com', scope: 'https://graph.microsoft.com/.default' },
  mde: {
    origin: 'https://api.security.microsoft.com',
    scope: 'https://api.securitycenter.microsoft.com/.default',
  },
} as const;
export const resources = {
  alerts: {
    provider: 'graph',
    path: '/v1.0/security/alerts_v2?$top=100',
    permission: 'SecurityAlert.Read.All',
  },
  incidents: {
    provider: 'graph',
    path: '/v1.0/security/incidents?$top=100',
    permission: 'SecurityIncident.Read.All',
  },
  devices: { provider: 'mde', path: '/api/machines?$top=100', permission: 'Machine.Read.All' },
  software: { provider: 'mde', path: '/api/Software?$top=100', permission: 'Software.Read.All' },
  vulnerabilities: {
    provider: 'mde',
    path: '/api/vulnerabilities?$top=100',
    permission: 'Vulnerability.Read.All',
  },
  recommendations: {
    provider: 'mde',
    path: '/api/recommendations?$top=100',
    permission: 'SecurityRecommendation.Read.All',
  },
} as const;
export type Resource = keyof typeof resources;
export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const pageSchema = z.object({
  value: z.array(z.record(z.string(), z.unknown())),
  '@odata.nextLink': z.string().optional(),
});
export function validateNextLink(raw: string, provider: Provider, pathname: string): URL {
  const url = new URL(raw);
  if (
    url.origin !== cloud[provider].origin ||
    url.pathname !== pathname ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new UpstreamError(502, 'The upstream service returned an unexpected pagination URL.');
  return url;
}
export class MicrosoftReader {
  private tokens = new Map<Provider, { value: string; expires: number }>();
  private cache = new Map<Resource, { value: Record<string, unknown>[]; expires: number }>();
  constructor(
    private credentials: Credentials,
    private fetcher: Fetcher = fetch,
  ) {
    z.string().uuid().parse(credentials.tenantId);
    z.string().uuid().parse(credentials.clientId);
    if (!credentials.clientSecret)
      throw new Error('Microsoft client credentials are not configured.');
  }
  private async token(provider: Provider) {
    const cached = this.tokens.get(provider);
    if (cached && cached.expires > Date.now()) return cached.value;
    const response = await this.fetcher(
      `https://login.microsoftonline.com/${this.credentials.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          grant_type: 'client_credentials',
          scope: cloud[provider].scope,
        }),
      },
    );
    if (!response.ok)
      throw new UpstreamError(
        503,
        'Microsoft authentication failed. Review the server credentials and admin consent.',
      );
    const token = z
      .object({ access_token: z.string().min(1), expires_in: z.number().positive().max(86400) })
      .parse(await response.json());
    this.tokens.set(provider, {
      value: token.access_token,
      expires: Date.now() + Math.max(0, token.expires_in - 120) * 1000,
    });
    return token.access_token;
  }
  async read(resource: Resource): Promise<Record<string, unknown>[]> {
    const cache = this.cache.get(resource);
    if (cache && cache.expires > Date.now()) return cache.value;
    const spec = resources[resource];
    const first = new URL(spec.path, cloud[spec.provider].origin);
    let next: URL | undefined = first;
    const result: Record<string, unknown>[] = [];
    const token = await this.token(spec.provider);
    let pages = 0;
    const seen = new Set<string>();
    while (next) {
      if (++pages > 10 || result.length >= 1000 || seen.has(next.href))
        throw new UpstreamError(
          502,
          'The result exceeds this workspace’s bounded snapshot. Narrow the source scope.',
        );
      seen.add(next.href);
      const response = await this.fetcher(next, {
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 401) this.tokens.delete(spec.provider);
        throw new UpstreamError(
          response.status === 403 ? 403 : 503,
          response.status === 403
            ? `This view requires ${spec.permission} and an eligible Microsoft license.`
            : response.status === 429
              ? 'Microsoft is limiting requests. Wait before refreshing.'
              : 'The Microsoft security service is unavailable. Try again later.',
        );
      }
      const text = await boundedText(response);
      const page = pageSchema.parse(JSON.parse(text));
      result.push(...page.value);
      if (result.length > 1000)
        throw new UpstreamError(502, 'The result exceeds the snapshot limit.');
      next = page['@odata.nextLink']
        ? validateNextLink(page['@odata.nextLink'], spec.provider, first.pathname)
        : undefined;
    }
    this.cache.set(resource, { value: result, expires: Date.now() + 60000 });
    return result;
  }
}
export async function boundedText(response: Response, maxBytes = 5_000_000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UpstreamError(502, 'The upstream response is too large.');
      }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}
function str(value: unknown, fallback = 'Not reported'): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}
function severity(value: unknown): Alert['severity'] {
  return ['high', 'medium', 'low', 'informational'].includes(str(value))
    ? (value as Alert['severity'])
    : 'informational';
}
export function mapAlert(raw: Record<string, unknown>): Alert {
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object',
      )
    : [];
  const device = evidence.find((item) => str(item['@odata.type']).includes('deviceEvidence'));
  return {
    id: str(raw.id),
    title: str(raw.title),
    severity: severity(raw.severity),
    status:
      raw.status === 'resolved' ? 'resolved' : raw.status === 'inProgress' ? 'inProgress' : 'new',
    deviceId: str(device?.mdeDeviceId, ''),
    createdAt: str(raw.createdDateTime, ''),
    description: str(raw.description),
    category: str(raw.category),
    evidence: evidence.map((item, index) => {
      const type = str(item['@odata.type']);
      const kind = type.includes('processEvidence')
        ? 'process'
        : type.includes('registry')
          ? 'registry'
          : type.includes('fileEvidence')
            ? 'file'
            : type.includes('ipEvidence')
              ? 'ip'
              : 'account';
      const image =
        item.imageFile && typeof item.imageFile === 'object'
          ? (item.imageFile as Record<string, unknown>)
          : undefined;
      return {
        id: `${str(raw.id)}-${index}`,
        type: kind,
        name: str(
          item.processCommandLine ??
            item.fileName ??
            image?.fileName ??
            item.registryKey ??
            item.ipAddress ??
            item.displayName ??
            item['@odata.type'],
        ),
        detail: str(
          item.processCommandLine ??
            item.filePath ??
            item.registryValueData ??
            item.dnsDomain ??
            item.ipAddress ??
            item.verdict,
        ),
        verdict: str(item.verdict),
      };
    }),
  };
}
export function mapDevice(raw: Record<string, unknown>): Device {
  return {
    id: str(raw.id),
    name: str(raw.computerDnsName),
    os: str(raw.osPlatform),
    role: str(raw.machineGroup),
    risk: ['high', 'medium', 'low', 'none'].includes(str(raw.riskScore).toLowerCase())
      ? (str(raw.riskScore).toLowerCase() as Device['risk'])
      : 'unknown',
    health: str(raw.healthStatus),
    lastSeen: str(raw.lastSeen, ''),
    isolation: 'unknown',
    protection: 'Not reported by this endpoint',
    signatures: 'Not reported by this endpoint',
    ip: str(raw.lastIpAddress),
  };
}
export function mapRecord(raw: Record<string, unknown>): RecordItem {
  return {
    id: str(raw.id),
    name: str(raw.displayName ?? raw.title ?? raw.name ?? raw.type ?? raw.id),
    subtitle: str(raw.description ?? raw.status ?? raw.machineId),
    status: str(raw.status ?? raw.state),
    description: str(raw.description, 'Read-only record from the Microsoft security API.'),
    facts: Object.entries(raw)
      .filter(
        ([key, value]) =>
          !key.startsWith('@') &&
          value !== null &&
          ['string', 'number', 'boolean'].includes(typeof value),
      )
      .slice(0, 15)
      .map(([key, value]) => [key, String(value)]),
  };
}
