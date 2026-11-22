import { useEffect, useState } from 'react';
import type { Dataset } from './domain';
import { formatDate } from './domain';
import { Notice } from './components';
import { expireSessionIfNeeded } from './api';
export function coverageState(data: Dataset, now = Date.now()) {
  if (data.mode === 'sample') return 'sample';
  if (!data.freshness || data.freshness.state === 'unavailable') return 'unavailable';
  const last = Date.parse(data.freshness.lastSuccessfulReadAt);
  return !Number.isFinite(last) || last > now + 60_000
    ? 'unavailable'
    : data.freshness.state === 'stale' || now - last > data.freshness.maxAgeMs
      ? 'stale'
      : 'fresh';
}
export function Freshness({ data, visible = true }: { data: Dataset; visible?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => {
      setNow(Date.now());
      expireSessionIfNeeded();
    };
    const timer = setInterval(update, 30_000);
    addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  if (data.mode === 'sample' || !visible) return null;
  const state = coverageState(data, now);
  return (
    <div role="status" data-coverage={state}>
      <Notice tone={state === 'fresh' ? '' : 'danger'}>
        <strong>
          {state === 'fresh'
            ? 'Collector snapshot available'
            : state === 'stale'
              ? 'Coverage is out of date'
              : 'Current coverage is unavailable'}
        </strong>
        <p className="small">
          Last successful read:{' '}
          {data.freshness ? formatDate(data.freshness.lastSuccessfulReadAt) : 'Not verified'}.
          Collection runs hourly. Refreshing this page reads the handoff, not Microsoft Graph.
        </p>
      </Notice>
    </div>
  );
}
