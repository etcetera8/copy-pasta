// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateInfo } from '../../shared/types';
import { Version } from './Version';

/**
 * Bug 10: the version string used to be read with `document.getElementById`
 * and `ipcRenderer` from the *main* process, where neither exists. The value
 * now comes over the preload bridge and is rendered as React state, so these
 * tests stub the bridge -- the only thing the component is allowed to reach for.
 *
 * The stub provides the whole surface the component touches, not just the one
 * member under test: a partial bridge throws inside the effect rather than
 * failing the assertion you meant to make.
 */
function stubBridge(opts: {
  version?: () => Promise<string>;
  update?: () => Promise<UpdateInfo | null>;
} = {}) {
  const getVersion = vi.fn(opts.version ?? (() => Promise.resolve('1.0.0')));
  const getUpdateInfo = vi.fn(opts.update ?? (() => Promise.resolve(null)));
  const openReleasePage = vi.fn();
  (window as any).copyPasta = { getVersion, getUpdateInfo, openReleasePage };
  return { getVersion, getUpdateInfo, openReleasePage };
}

describe('Version', () => {
  afterEach(() => {
    // Auto-cleanup only registers when Vitest runs with `globals: true`, and
    // this project does not. Without it every render stays in the document and
    // leaks into the next test -- which only stayed invisible while each test
    // happened to assert on a version string no other test used.
    cleanup();
    delete (window as any).copyPasta;
  });

  it('renders the version the bridge returns', async () => {
    // Deliberately not the package.json version: a hard-coded string would
    // pass a test that asserted "1.0.0".
    stubBridge({ version: () => Promise.resolve('4.2.0') });

    render(<Version />);

    expect(await screen.findByText('Version 4.2.0')).toBeTruthy();
  });

  it('asks main rather than assuming a version', async () => {
    const { getVersion } = stubBridge({ version: () => Promise.resolve('9.9.9') });

    render(<Version />);

    await screen.findByText('Version 9.9.9');
    expect(getVersion).toHaveBeenCalledTimes(1);
  });

  it('renders nothing until main has answered', async () => {
    let answer: (v: string) => void;
    stubBridge({ version: () => new Promise<string>((resolve) => { answer = resolve; }) });

    const { container } = render(<Version />);

    // No placeholder, no empty "Version " with nothing after it.
    expect(container.textContent).toBe('');

    answer!('1.2.3');
    expect(await screen.findByText('Version 1.2.3')).toBeTruthy();
  });

  it('stays quiet if main cannot answer', async () => {
    // An unhandled rejection here would surface as a renderer-side error; the
    // component swallows it and simply shows nothing.
    stubBridge({ version: () => Promise.reject(new Error('no main')) });

    const { container } = render(<Version />);

    await waitFor(() => {
      expect(container.textContent).toBe('');
    });
  });

  it('shows nothing extra when there is no update', async () => {
    stubBridge({ version: () => Promise.resolve('1.0.0') });

    render(<Version />);

    expect(await screen.findByText(/Version 1\.0\.0/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the new version when one exists', async () => {
    stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => Promise.resolve({ version: '1.1.0' }),
    });

    render(<Version />);

    expect(await screen.findByRole('button', { name: '1.1.0 available' })).toBeTruthy();
    // The running version stays visible alongside it.
    expect(screen.getByText(/Version 1\.0\.0/)).toBeTruthy();
  });

  it('asks main to open the release page when clicked', async () => {
    const { openReleasePage } = stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => Promise.resolve({ version: '1.1.0' }),
    });

    render(<Version />);
    (await screen.findByRole('button', { name: '1.1.0 available' })).click();

    // No argument: main opens the URL it already holds.
    expect(openReleasePage).toHaveBeenCalledTimes(1);
    expect(openReleasePage).toHaveBeenCalledWith();
  });

  it('stays quiet when the update check cannot answer', async () => {
    stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => Promise.reject(new Error('no main')),
    });

    render(<Version />);

    expect(await screen.findByText(/Version 1\.0\.0/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  it('shows the version even while the update check is still pending', async () => {
    stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => new Promise(() => { /* never settles */ }),
    });

    render(<Version />);

    // The version must not wait on the update check.
    expect(await screen.findByText(/Version 1\.0\.0/)).toBeTruthy();
  });
});
