import { describe, expect, it } from 'vitest';
import { priorityAlert } from '../src/selectors';
import { sampleData } from '../src/sample-data';

describe('overview priority', () => {
  it('selects the most severe unresolved alert, then the newest, without reordering source records', () => {
    const base = sampleData.alerts[0];
    const alerts = [
      { ...base, id: 'low', severity: 'low' as const },
      { ...base, id: 'resolved', status: 'resolved' as const, createdAt: '2026-06-20T00:00:00Z' },
      { ...base, id: 'older', createdAt: '2026-06-18T00:00:00Z' },
      { ...base, id: 'newer', createdAt: '2026-06-19T00:00:00Z' },
    ];
    const original = [...alerts];
    expect(priorityAlert(alerts)?.id).toBe('newer');
    expect(alerts).toEqual(original);
    expect(priorityAlert(alerts.filter((a) => a.status === 'resolved'))).toBeUndefined();
  });
});
