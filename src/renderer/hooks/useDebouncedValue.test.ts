// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebouncedValue('alpha', 500));

    // No timer has run yet, so this must be the value passed in -- not
    // `undefined` and not an empty string.
    expect(result.current).toBe('alpha');
  });

  it('keeps returning the old value until the delay has fully elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 500),
      { initialProps: { value: 'alpha' } },
    );

    rerender({ value: 'beta' });
    expect(result.current).toBe('alpha');

    // One millisecond short of the delay: still the old value.
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe('alpha');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('beta');
  });

  it('settles on the last of a rapid sequence without emitting intermediates', () => {
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ value }) => {
        const debounced = useDebouncedValue(value, 500);
        seen.push(debounced);
        return debounced;
      },
      { initialProps: { value: '' } },
    );

    // Someone typing "(bar" one character at a time, faster than the delay.
    for (const value of ['(', '(b', '(ba', '(bar']) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    // Nothing has settled yet: 400ms of typing < 500ms delay.
    expect(seen).toEqual(['', '', '', '', '']);

    // Step forward in slices rather than one jump. A hook that queues a timer
    // per keystroke and never cancels the earlier ones would emit '(' here at
    // t=600, '(b' at t=700 and so on; React only coalesces those if they all
    // land inside a single act() flush.
    for (let elapsed = 0; elapsed < 500; elapsed += 100) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    // Exactly one new value, and it is the last one typed. If the hook did not
    // debounce, `seen` would contain every intermediate prefix.
    expect(seen.at(-1)).toBe('(bar');
    expect(new Set(seen)).toEqual(new Set(['', '(bar']));
  });

  it('does not re-emit when the delay passes with no change', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 500),
      { initialProps: { value: 'alpha' } },
    );

    rerender({ value: 'beta' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('beta');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('beta');
  });

  it('cancels its pending timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 500),
      { initialProps: { value: 'alpha' } },
    );

    rerender({ value: 'beta' });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    // A leaked timer would still be queued here; the fake clock reports none.
    expect(vi.getTimerCount()).toBe(0);
    clearTimeoutSpy.mockRestore();
  });
});
