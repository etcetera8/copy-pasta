// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
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

/**
 * jsdom has no layout: every element measures zero. These stubs give the
 * fitted-page-size hook something real to measure.
 */
function stubLayout({ rowHeight, listHeight }: { rowHeight: number; listHeight: number }) {
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const height = this.classList.contains('row') ? rowHeight : 0;
      return { height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
  const client = vi
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('row-list') ? listHeight : 0;
    });
  return (): void => {
    rect.mockRestore();
    client.mockRestore();
  };
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

  // Bug 6 regression guard. The search term used to be compiled with
  // `new RegExp(searchTerm)`, so a lone `(` threw. Phase 3 moved results() to a
  // substring match; this drives the same path the user does -- through the
  // real <input>, the debounce, and into the store.
  it('accepts regex metacharacters typed into the search box', () => {
    const store = new ClipboardStore();
    store.add('call foo(bar)');
    store.add('unrelated');

    const { container } = render(<Landing store={store} />);
    const search = container.querySelector('input.search')!;

    for (const value of ['(', '(b', '(bar)', '[', '*', '\\']) {
      expect(() => {
        fireEvent.change(search, { target: { value } });
        act(() => {
          vi.advanceTimersByTime(600);
        });
      }, `typing ${value} threw`).not.toThrow();
    }

    // And the search actually filtered rather than silently matching nothing.
    fireEvent.change(search, { target: { value: '(bar)' } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const rows = container.querySelectorAll('.row');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-content')).toBe('call foo(bar)');
  });

  describe('Show More', () => {
    const storeWith = (n: number): ClipboardStore => {
      const store = new ClipboardStore();
      for (let i = 0; i < n; i++) store.add(`item ${i}`);
      return store;
    };
    const showMore = (c: HTMLElement): HTMLButtonElement | null =>
      [...c.querySelectorAll<HTMLButtonElement>('.load-more')].find(
        (b) => b.textContent?.includes('Show More'),
      ) ?? null;

    it('is hidden when the history is empty', () => {
      const { container } = render(<Landing store={storeWith(0)} />);
      expect(showMore(container)).toBeNull();
    });

    it('is hidden when every item already fits on the first page', () => {
      const { container } = render(<Landing store={storeWith(13)} />);
      expect(container.querySelectorAll('.row')).toHaveLength(13);
      expect(showMore(container)).toBeNull();
    });

    it('is shown when items are hidden past the first page', () => {
      const { container } = render(<Landing store={storeWith(14)} />);
      expect(container.querySelectorAll('.row')).toHaveLength(13);
      expect(showMore(container)).not.toBeNull();
    });

    it('disappears once the last hidden item has been revealed', () => {
      const { container } = render(<Landing store={storeWith(14)} />);
      fireEvent.click(showMore(container)!);
      expect(container.querySelectorAll('.row')).toHaveLength(14);
      expect(showMore(container)).toBeNull();
    });

    /**
     * The reported bug: a 12-item history with a fixed page size of 13 meant
     * the button could never appear, while the list still ran well past the
     * bottom of an 800x600 window. The page is measured now, so 12 items in a
     * space that holds 4 leaves 8 hidden -- and the button says so.
     */
    it('appears when fewer items fit on screen than the page default', () => {
      const restore = stubLayout({ rowHeight: 72, listHeight: 290 });
      try {
        const { container } = render(<Landing store={storeWith(12)} />);
        expect(container.querySelectorAll('.row')).toHaveLength(4);
        expect(showMore(container)).not.toBeNull();
      } finally {
        restore();
      }
    });

    it('shows more rows in a taller window', () => {
      const restore = stubLayout({ rowHeight: 72, listHeight: 730 });
      try {
        const { container } = render(<Landing store={storeWith(12)} />);
        expect(container.querySelectorAll('.row')).toHaveLength(10);
        expect(showMore(container)).not.toBeNull();
      } finally {
        restore();
      }
    });

    it('hides when a search narrows the results to one page', () => {
      const { container } = render(<Landing store={storeWith(20)} />);
      expect(showMore(container)).not.toBeNull();

      fireEvent.change(container.querySelector('.search')!, {
        target: { value: 'item 1' },
      });
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // "item 1", "item 10".."item 19" -- 11 matches, one page.
      expect(container.querySelectorAll('.row')).toHaveLength(11);
      expect(showMore(container)).toBeNull();
    });
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
