import { z } from 'zod';

export const severitySchema = z.enum(['high', 'medium', 'low', 'informational']);
export type Severity = z.infer<typeof severitySchema>;
export const alertSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: severitySchema,
  status: z.enum(['new', 'inProgress', 'resolved']),
  deviceId: z.string(),
  createdAt: z.string(),
  description: z.string(),
  category: z.string(),
  evidence: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['process', 'file', 'registry', 'account', 'ip']),
      name: z.string(),
      detail: z.string(),
      verdict: z.string(),
    }),
  ),
});
export type Alert = z.infer<typeof alertSchema>;
export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  os: z.string(),
  role: z.string(),
  risk: z.enum(['high', 'medium', 'low', 'none', 'unknown']),
  health: z.string(),
  lastSeen: z.string(),
  isolation: z.enum(['isolated', 'normal', 'unknown']),
  protection: z.string(),
  signatures: z.string(),
  ip: z.string(),
});
export type Device = z.infer<typeof deviceSchema>;
export type RecordItem = {
  id: string;
  name: string;
  subtitle: string;
  status: string;
  severity?: Severity;
  facts: [string, string][];
  description: string;
};
export const datasetSchema = z.object({
  alerts: z.array(alertSchema),
  devices: z.array(deviceSchema),
  fetchedAt: z.string(),
  mode: z.enum(['sample', 'live']),
  warnings: z.array(z.string()),
});
export type Dataset = z.infer<typeof datasetSchema>;
export const severityRank: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  informational: 3,
};
export function filterAlerts(
  alerts: Alert[],
  query: string,
  status: string,
  severity: string,
): Alert[] {
  const q = query.trim().toLowerCase();
  return alerts
    .filter(
      (a) =>
        (status === 'all' || a.status === status) &&
        (severity === 'all' || a.severity === severity) &&
        (!q || `${a.title} ${a.deviceId} ${a.category}`.toLowerCase().includes(q)),
    )
    .toSorted(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.createdAt.localeCompare(a.createdAt),
    );
}
export function safeRead<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not reported'
    : new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(date);
}
export function summarize(alerts: Alert[]): { open: number; high: number; reviewed: number } {
  return {
    open: alerts.filter((a) => a.status !== 'resolved').length,
    high: alerts.filter((a) => a.severity === 'high' && a.status !== 'resolved').length,
    reviewed: alerts.filter((a) => a.status === 'resolved').length,
  };
}
