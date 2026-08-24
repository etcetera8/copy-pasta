// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_IN_MILLISECONDS } from '../constants';
import { ClipboardStore } from '../store/clipboardStore';
import { Landing } from './Landing';

/**
 * Bug 5: the expiry interval used to be kept in `useState` and cleared from a
 * `[]`-deps cleanup, which only ever saw the first render's `null`. The
 * interval therefore survived unmount and every hot reload, and kept a
 * reference to a dead store alive with it.
 */
function stubBridge() {
  const bridge = {
    loadHistory: vi.fn().mockResolvedValue({ items: [], lightTheme: false }),
    saveHistory: vi.fn().mockResolvedValue(undefined),
    writeClipboard: vi.fn().mockResolvedValue(undefined),
    onClipboardText: vi.fn().mockReturnValue(vi.fn()),
    onToggleTheme: vi.fn().mockReturnValue(vi.fn()),
    hideWindow: vi.fn(),
    hideAndPaste: vi.fn(),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
  };
  (window as any).copyPasta = bridge;
  return bridge;
}

describe('Landing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubBridge();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).copyPasta;
  });

  it('clears the expiry interval it started when it unmounts', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = render(<Landing store={new ClipboardStore()} />);

    // jsdom queues its own 0ms `selectionchange` timer in response to the
    // search box's autoFocus. Flush it so the count below is only ours.
    act(() => {
      vi.advanceTimersByTime(0);
    });

    const started = setInterval.mock.results.map((r) => r.value);
    expect(started).toHaveLength(1);
    // The expiry interval and the search debounce timeout, and nothing else.
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    // The exact handle must be cleared -- not merely "clearInterval was called".
    expect(clearInterval.mock.calls.map((c) => c[0])).toContain(started[0]);
    // And nothing may still be queued: no interval, no debounce timer.
    expect(vi.getTimerCount()).toBe(0);

    setInterval.mockRestore();
    clearInterval.mockRestore();
  });

  it('does not run expiry on a store it has already unmounted from', () => {
    const store = new ClipboardStore();
    const clearExpired = vi.spyOn(store, 'clearExpired');

    const { unmount } = render(<Landing store={store} />);
    clearExpired.mockClear(); // the mount-time sweep is expected; later ones are not

    unmount();
    vi.advanceTimersByTime(DAY_IN_MILLISECONDS * 3);

    // A leaked interval would have fired three times by now.
    expect(clearExpired).not.toHaveBeenCalled();
  });

  it('unsubscribes from both bridge subscriptions on unmount', () => {
    const bridge = (window as any).copyPasta;
    const offClipboardText = vi.fn();
    const offToggleTheme = vi.fn();
    bridge.onClipboardText.mockReturnValue(offClipboardText);
    bridge.onToggleTheme.mockReturnValue(offToggleTheme);

    const { unmount } = render(<Landing store={new ClipboardStore()} />);
    unmount();

    expect(offClipboardText).toHaveBeenCalledTimes(1);
    expect(offToggleTheme).toHaveBeenCalledTimes(1);
  });
});
