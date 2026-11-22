// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../src/App';
import { screens } from '../src/navigation';

beforeEach(() => {
  vi.stubGlobal('localStorage', window.localStorage);
  history.replaceState(null, '', '/');
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function navigate(hash: string) {
  await act(async () => {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
describe('public interface', () => {
  it.each(screens)('renders %s as an addressable English screen', (id, title) => {
    history.replaceState(null, '', `/#${id}`);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent?.length).toBeGreaterThan(0);
    expect(document.title).toBe(`${title} · Defender Companion`);
    expect(screen.getByText('Demo workspace')).toBeTruthy();
    expect(screen.getByText('Fictional data')).toBeTruthy();
  });
  it('filters alerts and recovers from a no-results search', async () => {
    history.replaceState(null, '', '/#alerts');
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Search alerts or device IDs'), {
      target: { value: 'nonexistent' },
    });
    expect(screen.getByRole('heading', { name: 'No matching alerts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 alerts shown')).toBeTruthy();
  });
  it('saves local review reasoning while preserving the source alert status', async () => {
    history.replaceState(null, '', '/#review/alert-001');
    render(<App />);
    const button = screen.getByRole('button', { name: 'Save review' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Evidence and reasoning'), {
      target: { value: 'Verified the process origin against the sample change record.' },
    });
    fireEvent.click(button);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save local review' }),
    );
    expect(JSON.parse(localStorage.getItem('dc.reviews')!)['alert-001']).toBeDefined();
    await navigate('alert/alert-001');
    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('new')).toBeTruthy();
  });
  it('acknowledges a reminder without closing the source alert', async () => {
    history.replaceState(null, '', '/#notification');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge reminder' }));
    expect(
      (screen.getByRole('button', { name: 'Acknowledged' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await navigate('home');
    expect(screen.getByRole('heading', { name: 'Possible credential access' })).toBeTruthy();
  });
  it('persists local notification preferences across remounts', () => {
    history.replaceState(null, '', '/#channels');
    const app = render(<App />);
    fireEvent.click(screen.getByRole('switch', { name: /Prefer spoken summaries/ }));
    app.unmount();
    render(<App />);
    expect(
      (screen.getByRole('switch', { name: /Prefer spoken summaries/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });
  it('never sends a network request in the sample-data flow', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    render(<App />);

    await navigate('connections');
    await navigate('access');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps the selected device when opening scan history, without inventing a scan', async () => {
    history.replaceState(null, '', '/#device/atlas');
    render(<App />);
    expect(screen.getByRole('link', { name: /Antivirus health/ }).getAttribute('href')).toBe(
      '#antivirus/atlas',
    );
    await navigate('antivirus/atlas');
    expect(screen.getByRole('link', { name: /View scan history/ }).getAttribute('href')).toBe(
      '#scans/atlas',
    );
    await navigate('scans/atlas');
    expect(location.hash).toBe('#scans/atlas');
    expect(screen.getByText('No scan history for this device')).toBeTruthy();
    expect(screen.queryByText('Full antivirus scan')).toBeNull();
    await navigate('scans/nova');
    expect(screen.getByText('Full antivirus scan')).toBeTruthy();
    expect(screen.getAllByText('Nova').length).toBeGreaterThan(0);
  });
});
