import type { Store } from '../../server/store';
export function boundHeaders(store: Store, cookie: string) {
  const token = cookie.match(/(?:^|;\s*)dc-session=([^;]+)/)?.[1];
  return { cookie, ...(token ? { 'x-workspace-binding': store.browserBinding(token) } : {}) };
}
