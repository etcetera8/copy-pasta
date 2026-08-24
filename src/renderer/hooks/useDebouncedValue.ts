import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delay` ms, replacing `react-debounce-input`
 * (unmaintained since 2022) with something that works on a plain `<input>`.
 *
 * The initial value is returned synchronously; every later change restarts the
 * timer, so a burst of changes emits only the last one.
 */
export function useDebouncedValue<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
