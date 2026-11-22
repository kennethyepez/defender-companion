import { sampleData } from '../../src/sample-data';
import type { Dataset } from '../../src/domain';
export const workspace = (): Dataset & { freshness: NonNullable<Dataset['freshness']> } => ({
  ...structuredClone(sampleData),
  mode: 'live',
  fetchedAt: new Date().toISOString(),
  freshness: {
    state: 'fresh',
    lastSuccessfulReadAt: new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
    maxAgeMs: 75 * 60_000,
  },
});
