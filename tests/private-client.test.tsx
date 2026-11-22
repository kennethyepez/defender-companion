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
it('uses a binding only in tab memory and clears it after sign-out', async () => {
  const binding = 'a'.repeat(64);
  const calls: RequestInit[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    calls.push(options!);
    return response({}, calls.length === 1 ? { 'x-workspace-binding': binding } : {});
  });
  await request('auth/login/verify', {});
  await request('workspace');
  expect(calls[1].headers).toMatchObject({ 'X-Workspace-Binding': binding });
  await request('auth/sessions/revoke-all', {});
  expect(calls[2].headers).toMatchObject({ 'X-Workspace-Binding': binding });
  await request('auth/status');
  expect(calls[3].headers).not.toHaveProperty('X-Workspace-Binding');
});
it('does not restore a browser proof from a late authentication response after logout', async () => {
  let complete!: (value: Response) => void;
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValue(response({}));
  const pending = request('auth/login/verify', {});
  clearPrivateSession();
  complete(response({}, { 'x-workspace-binding': 'b'.repeat(64) }));
  await expect(pending).rejects.toMatchObject({ status: 401 });
  await request('auth/status');
  expect(fetcher.mock.calls[1][1]?.headers).not.toHaveProperty('X-Workspace-Binding');
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
