import { filterAlerts as selectAlerts, type Alert } from './domain';
export function filterAlerts(
  alerts: Alert[],
  filter: { query: string; status: string; severity: string },
) {
  return selectAlerts(alerts, filter.query, filter.status, filter.severity);
}
