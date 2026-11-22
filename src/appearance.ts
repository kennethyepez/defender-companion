import { useEffect, useLayoutEffect, useState } from 'react';

export type Appearance = 'system' | 'light' | 'dark';
const key = 'dc.appearance';
function readAppearance(): Appearance {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}
export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const resolved = appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
  function chooseAppearance(value: Appearance) {
    setAppearance(value);
    const native = (window as Window & { DefenderNative?: { postMessage(value: string): void } })
      .DefenderNative;
    try {
      native?.postMessage(JSON.stringify({ action: 'appearance', value }));
    } catch {
      /* The web preference remains usable without native integration. */
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Choice still works for this session. */
    }
  }
  return { appearance, chooseAppearance };
}
