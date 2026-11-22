import { describe, expect, it } from 'vitest';
import { datasetSchema, filterAlerts, summarize } from '../src/domain';
import { sampleData } from '../src/sample-data';
import { parseRoute, screens } from '../src/navigation';

describe('investigation views', () => {
  it('keeps severity ordering deterministic and filters without changing source alerts', () => {
    const before = JSON.stringify(sampleData.alerts);
    expect(filterAlerts(sampleData.alerts, 'credential', 'all', 'high').map((a) => a.id)).toEqual([
      'alert-001',
    ]);
    expect(filterAlerts(sampleData.alerts, '', 'resolved', 'all')).toHaveLength(2);
    expect(filterAlerts(sampleData.alerts, 'no-such-evidence', 'all', 'all')).toHaveLength(0);
    expect(JSON.stringify(sampleData.alerts)).toBe(before);
    expect(summarize(sampleData.alerts)).toEqual({ open: 1, high: 1, reviewed: 2 });
  });
  it('validates a complete dataset and rejects malformed server responses', () => {
    expect(datasetSchema.safeParse(sampleData).success).toBe(true);
    expect(
      datasetSchema.safeParse({
        ...sampleData,
        alerts: [{ ...sampleData.alerts[0], severity: 'critical' }],
      }).success,
    ).toBe(false);
  });
  it('makes all 46 routes addressable and safely handles unknown paths', () => {
    expect(screens).toHaveLength(46);
    expect(new Set(screens.map(([id]) => id)).size).toBe(46);
    for (const [screen] of screens) expect(parseRoute(`#${screen}/record`).screen).toBe(screen);
    expect(parseRoute('#unexpected')).toEqual({ screen: 'home', id: undefined });
  });
});
