// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Version } from './Version';

/**
 * Bug 10: the version string used to be read with `document.getElementById`
 * and `ipcRenderer` from the *main* process, where neither exists. The value
 * now comes over the preload bridge and is rendered as React state, so these
 * tests stub `window.copyPasta.getVersion` -- the only thing the component is
 * allowed to reach for.
 */
function stubGetVersion(impl: () => Promise<string>) {
  const getVersion = vi.fn(impl);
  (window as any).copyPasta = { getVersion };
  return getVersion;
}

describe('Version', () => {
  afterEach(() => {
    delete (window as any).copyPasta;
  });

  it('renders the version the bridge returns', async () => {
    // Deliberately not the package.json version: a hard-coded string would
    // pass a test that asserted "1.0.0".
    stubGetVersion(() => Promise.resolve('4.2.0'));

    render(<Version />);

    expect(await screen.findByText('Version 4.2.0')).toBeTruthy();
  });

  it('asks main rather than assuming a version', async () => {
    const getVersion = stubGetVersion(() => Promise.resolve('9.9.9'));

    render(<Version />);

    await screen.findByText('Version 9.9.9');
    expect(getVersion).toHaveBeenCalledTimes(1);
  });

  it('renders nothing until main has answered', async () => {
    let answer: (v: string) => void;
    stubGetVersion(() => new Promise<string>((resolve) => { answer = resolve; }));

    const { container } = render(<Version />);

    // No placeholder, no empty "Version " with nothing after it.
    expect(container.textContent).toBe('');

    answer!('1.2.3');
    expect(await screen.findByText('Version 1.2.3')).toBeTruthy();
  });

  it('stays quiet if main cannot answer', async () => {
    // An unhandled rejection here would surface as a renderer-side error; the
    // component swallows it and simply shows nothing.
    stubGetVersion(() => Promise.reject(new Error('no main')));

    const { container } = render(<Version />);

    await waitFor(() => {
      expect(container.textContent).toBe('');
    });
  });
});
