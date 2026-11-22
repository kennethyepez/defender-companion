// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { PullToRefresh } from '../src/PullToRefresh';

beforeEach(() => {
  vi.stubGlobal('localStorage', window.localStorage);
  localStorage.clear();
  history.replaceState(null, '', '/#settings');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('scrollY', 0);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function start(target: HTMLElement, x = 100, y = 100) {
  fireEvent.touchStart(target, { touches: [{ clientX: x, clientY: y }] });
}
function move(target: HTMLElement, x = 100, y = 280) {
  fireEvent.touchMove(target, { touches: [{ clientX: x, clientY: y }], cancelable: true });
}
function end(target: HTMLElement) {
  fireEvent.touchEnd(target, { touches: [] });
}

it('refreshes only after a deliberate downward release and prevents concurrent requests', async () => {
  let finish!: () => void;
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <>
      <PullToRefresh onRefresh={refresh} disabled={false} />
      <main data-testid="content" />
    </>,
  );
  const content = screen.getByTestId('content');
  start(content);
  move(content);
  expect(screen.getByText('Release to refresh')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => end(content));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Refreshing…')).toBeTruthy();
  await act(async () => {
    start(content);
    move(content);
    end(content);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(screen.queryByText('Refreshing…')).toBeNull();
});

it('leaves scrolling, short swipes, cancelled gestures and form fields alone', async () => {
  const refresh = vi.fn(async () => {});
  render(
    <>
      <PullToRefresh onRefresh={refresh} disabled={false} />
      <main data-testid="content" />
      <input aria-label="Search" />
    </>,
  );
  const content = screen.getByTestId('content');
  await act(async () => {
    start(content);
    move(content, 100, 130);
    end(content);
    start(content);
    move(content, 300, 120);
    end(content);
    start(content);
    move(content);
    fireEvent.touchCancel(content);
    end(content);
    const input = screen.getByRole('textbox');
    start(input);
    move(input);
    end(input);
    vi.stubGlobal('scrollY', 50);
    start(content);
    move(content);
    end(content);
  });
  expect(refresh).not.toHaveBeenCalled();
});

it('recovers after a failed refresh and blocks gestures behind a modal', async () => {
  const refresh = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const app = render(
    <>
      <PullToRefresh onRefresh={refresh} disabled={true} />
      <main data-testid="content" />
    </>,
  );
  const content = screen.getByTestId('content');
  await act(async () => {
    start(content);
    move(content);
    end(content);
  });
  expect(refresh).not.toHaveBeenCalled();
  app.rerender(
    <>
      <PullToRefresh onRefresh={refresh} disabled={false} />
      <main data-testid="content" />
    </>,
  );
  await act(async () => {
    start(content);
    move(content);
    end(content);
  });
  expect(screen.getByText('Couldn’t refresh. Pull down to try again.')).toBeTruthy();
  await act(async () => {
    start(content);
    move(content);
    end(content);
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Couldn’t refresh. Pull down to try again.')).toBeNull();
});

it('persists an appearance choice, removes header refresh and keeps a keyboard alternative', () => {
  const app = render(<App />);
  expect(screen.queryByRole('button', { name: 'Refresh snapshot' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh data' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  app.unmount();
  render(<App />);
  expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('follows system appearance changes without changing an explicit choice', () => {
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => media);
  render(<App />);
  const change = media.addEventListener.mock.calls[0][1];
  act(() => {
    media.matches = true;
    change();
  });
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  act(() => {
    media.matches = true;
    change();
  });
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'System' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});
