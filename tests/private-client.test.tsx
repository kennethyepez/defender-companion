// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { clearPrivateSession, expireSessionIfNeeded, request } from '../src/api';
import { Freshness } from '../src/Freshness';
import { workspace } from './helpers/workspace';
import { App } from '../src/App';
afterEach(() => {
  cleanup();
  clearPrivateSession();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps live notes out of storage and clears them when the session ends', async () => {
  vi.stubGlobal('localStorage', window.localStorage);
  window.localStorage.clear();
  window.localStorage.setItem(
    'dc.reviews',
    JSON.stringify({ legacy: { note: 'preserved legacy note' } }),
  );
  history.replaceState(null, '', '/?mode=live#review/alert-001');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response(workspace()));
  await act(async () => {
    render(<App />);
  });
  const note = screen.getByLabelText('Evidence and reasoning');
  fireEvent.change(note, { target: { value: 'new sensitive note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Save local review',
    }),
  );
  expect(window.localStorage.getItem('dc.reviews')).toContain('preserved legacy note');
  expect(window.localStorage.getItem('dc.reviews')).not.toContain('new sensitive note');
  await act(async () => clearPrivateSession());
  expect(screen.queryByDisplayValue('new sensitive note')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Sign in to your private workspace' })).toBeTruthy();
});

it('does not claim current coverage when a stale snapshot has no open alerts', async () => {
  history.replaceState(null, '', '/?mode=live#home');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const data = workspace();
  data.alerts = [];
  data.freshness.state = 'stale';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(data));
  render(<App />);
  expect(await screen.findByText('No open alerts in snapshot')).toBeTruthy();
  expect(screen.getByText('Coverage is out of date')).toBeTruthy();
  expect(screen.queryByText('Up to date')).toBeNull();
});
const response = (value: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', ...headers },
  });
it('rejects a private response that arrives after sign-out', async () => {
  let complete!: (r: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = request('workspace');
  clearPrivateSession();
  complete(response({ secret: 'not restored' }));
  await expect(pending).rejects.toMatchObject({ status: 401 });
});
it('clears tab session at idle or absolute expiry without another API read', async () => {
  const ended = vi.fn();
  window.addEventListener('dc-session-ended', ended);
  const now = Date.now();
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    response(
      {},
      {
        'x-session-expires-at': String(now + 7200000),
        'x-session-idle-expires-at': String(now + 900000),
      },
    ),
  );
  await request('auth/status');
  expireSessionIfNeeded(now + 900000);
  expect(ended).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
  window.removeEventListener('dc-session-ended', ended);
});
it('changes displayed coverage with the local clock and never polls', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  vi.setSystemTime(now);
  const fetcher = vi.spyOn(globalThis, 'fetch');
  const data = workspace();
  render(<Freshness data={data} />);
  expect(screen.getByText('Collector snapshot available')).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(76 * 60000);
  });
  expect(screen.getByText('Coverage is out of date')).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
