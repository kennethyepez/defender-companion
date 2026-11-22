import { useEffect, useRef, useState } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';

const threshold = 56;
export function PullToRefresh({
  onRefresh,
  disabled,
}: {
  onRefresh: () => Promise<void>;
  disabled: boolean;
}) {
  const callback = useRef(onRefresh);
  const blocked = useRef(disabled);
  callback.current = onRefresh;
  blocked.current = disabled;
  const inFlight = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let start: { x: number; y: number } | undefined;
    let pulled = 0;
    const reset = () => {
      start = undefined;
      pulled = 0;
      setDistance(0);
    };
    const begin = (event: TouchEvent) => {
      if (
        inFlight.current ||
        blocked.current ||
        window.scrollY > 0 ||
        event.touches.length !== 1 ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable], dialog, nav, .topbar'))
      )
        return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      pulled = 0;
      setFailed(false);
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 0 || blocked.current) {
        reset();
        return;
      }
      const y = event.touches[0].clientY - start.y;
      const x = Math.abs(event.touches[0].clientX - start.x);
      if (y < 0 || x > Math.max(12, y)) {
        reset();
        return;
      }
      if (y < 8) return;
      if (event.cancelable) event.preventDefault();
      pulled = Math.min(84, y * 0.45);
      setDistance(pulled);
    };
    const end = () => {
      const shouldRefresh = pulled >= threshold && !blocked.current && !inFlight.current;
      reset();
      if (!shouldRefresh) return;
      inFlight.current = true;
      setRefreshing(true);
      void Promise.resolve()
        .then(() => callback.current())
        .catch(() => setFailed(true))
        .finally(() => {
          inFlight.current = false;
          setRefreshing(false);
        });
    };
    document.addEventListener('touchstart', begin, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      document.removeEventListener('touchstart', begin);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', reset);
    };
  }, []);
  const shown = distance > 0 || refreshing || failed;
  return (
    <div
      className={`pull-refresh${shown ? ' visible' : ''}${refreshing ? ' refreshing' : ''}${distance >= threshold ? ' ready' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {shown && (
        <>
          <span className="pull-refresh-icon" aria-hidden="true">
            {refreshing ? <RefreshCw size={19} /> : <ArrowDown size={19} />}
          </span>
          <span>
            {failed
              ? 'Couldn’t refresh. Pull down to try again.'
              : refreshing
                ? 'Refreshing…'
                : distance >= threshold
                  ? 'Release to refresh'
                  : 'Pull to refresh'}
          </span>
        </>
      )}
    </div>
  );
}
