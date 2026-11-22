// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { downloadJson } from '../src/api';
afterEach(() => {
  delete (window as Window & { DefenderNative?: unknown }).DefenderNative;
  vi.restoreAllMocks();
});
it('allows only the sample snapshot to request the native save dialog', () => {
  const postMessage = vi.fn();
  Object.assign(window, { DefenderNative: { postMessage } });
  expect(downloadJson('ignored.json', { mode: 'sample', alerts: [] })).toBe('save-dialog');
  expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
    action: 'exportDemo',
    json: JSON.stringify({ mode: 'sample', alerts: [] }, null, 2),
  });
});
it('never sends a private summary or workspace into the offline native bridge', () => {
  const postMessage = vi.fn();
  Object.assign(window, { DefenderNative: { postMessage } });
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  downloadJson('private.json', { mode: 'live', alerts: [] });
  downloadJson('summary.json', { source: 'private-collector-summary', deviceCount: 2 });
  expect(postMessage).not.toHaveBeenCalled();
});
