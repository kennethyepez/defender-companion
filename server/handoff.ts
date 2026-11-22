import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { datasetSchema, type Dataset } from '../src/domain';

export const MAX_SNAPSHOT_AGE_MS = 75 * 60_000;
export interface WorkspaceSource {
  read(): Promise<Dataset>;
}
const instant = z.string().datetime({ offset: true });
export const handoffSchema = z.object({
  format: z.literal('defender-companion-handoff-v1'),
  lastSuccessfulReadAt: instant,
  lastAttemptAt: instant,
  outcome: z.enum(['ok', 'failed']),
  alerts: z
    .array(
      datasetSchema.shape.alerts.element.extend({
        id: z.string().regex(/^a-[a-f0-9]{24}$/),
        deviceId: z.string().regex(/^d-[a-f0-9]{24}$/),
        category: z.enum([
          'Credential access',
          'Defense evasion',
          'Execution',
          'Persistence',
          'Initial access',
          'Command and control',
          'Exfiltration',
          'Discovery',
          'Lateral movement',
          'Collection',
          'Impact',
          'Security observation',
        ]),
        evidence: z
          .array(
            datasetSchema.shape.alerts.element.shape.evidence.element.extend({
              id: z.string().regex(/^e-[a-f0-9]{24}$/),
              verdict: z.enum([
                'unknown',
                'suspicious',
                'malicious',
                'noThreatsFound',
                'notApplicable',
              ]),
            }),
          )
          .max(100),
      }),
    )
    .max(1000),
  devices: z
    .array(
      datasetSchema.shape.devices.element.extend({
        id: z.string().regex(/^d-[a-f0-9]{24}$/),
        name: z
          .string()
          .max(100)
          .regex(/^[A-Za-z0-9_.-]+$/),
        os: z.enum(['Windows', 'Windows 10', 'Windows 11', 'Linux', 'macOS', 'Unknown']),
      }),
    )
    .max(1000),
});
export type Handoff = z.infer<typeof handoffSchema>;
export function handoffDataset(input: unknown, now = Date.now()): Dataset {
  const handoff = handoffSchema.parse(input);
  const last = Date.parse(handoff.lastSuccessfulReadAt);
  const attempt = Date.parse(handoff.lastAttemptAt);
  if (last > now + 60_000 || attempt > now + 60_000 || attempt < last)
    throw new Error('Invalid source clock.');
  const age = Math.max(0, now - last);
  const status =
    handoff.outcome !== 'ok' ? 'unavailable' : age > MAX_SNAPSHOT_AGE_MS ? 'stale' : 'fresh';
  // Whitelist again at the consumer. Raw command lines, paths and account evidence never cross this boundary.
  const alerts = handoff.alerts.map((alert) => ({
    ...alert,
    title: `${alert.category} alert`,
    description:
      'Review the source alert in Defender for full evidence. Command lines, paths and account data are withheld here.',
    evidence: alert.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      name: `${item.type} observation`,
      detail: 'Full evidence is available only in Defender.',
      verdict: item.verdict,
    })),
  }));
  const devices = handoff.devices.map((device) => ({
    ...device,
    ip: 'Withheld',
    health: 'Not reported by alert API',
    lastSeen: '',
    protection: 'Not reported by alert API',
    signatures: 'Not reported by alert API',
    role: 'Alert-associated device',
    isolation: 'unknown' as const,
  }));
  return {
    mode: 'live',
    fetchedAt: handoff.lastSuccessfulReadAt,
    alerts,
    devices,
    freshness: {
      state: status,
      lastSuccessfulReadAt: handoff.lastSuccessfulReadAt,
      lastAttemptAt: handoff.lastAttemptAt,
      maxAgeMs: MAX_SNAPSHOT_AGE_MS,
    },
    warnings:
      status === 'fresh'
        ? []
        : [
            status === 'stale'
              ? 'The collector has not completed a successful read within 75 minutes. These records may be out of date.'
              : 'The collector reported a failure. This is the last successful snapshot, not current coverage.',
          ],
  };
}
export class HandoffReader implements WorkspaceSource {
  constructor(private file: string) {}
  async read(): Promise<Dataset> {
    const file = resolve(this.file);
    const directory = dirname(file);
    const canonicalDirectory = await realpath(directory);
    if (
      resolve(canonicalDirectory) !== directory ||
      (await lstat(file)).isSymbolicLink() ||
      resolve(await realpath(file)) !== file
    )
      throw new Error('The handoff must be a regular file in a canonical, protected directory.');
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 1_000_000) throw new Error('Invalid handoff size.');
      const buffer = Buffer.alloc(Math.min(stat.size + 1, 1_000_001));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 1_000_000) throw new Error('The handoff is too large.');
      return handoffDataset(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')));
    } finally {
      await handle.close();
    }
  }
}
