import { filterAlerts as selectAlerts, type Alert } from './domain';
export function filterAlerts(
  alerts: Alert[],
  filter: { query: string; status: string; severity: string },
) {
  return selectAlerts(alerts, filter.query, filter.status, filter.severity);
}

/** Prefer the most severe unresolved alert, then the newest; never reorder the source snapshot. */
export function priorityAlert(alerts: Alert[]) {
  const rank: Record<Alert['severity'], number> = { high: 3, medium: 2, low: 1, informational: 0 };
  return alerts
    .filter((alert) => alert.status !== 'resolved')
    .sort(
      (a, b) =>
        rank[b.severity] - rank[a.severity] || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )[0];
}
