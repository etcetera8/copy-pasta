import { RefObject, useCallback, useEffect, useState } from 'react';

/**
 * Page size used until the list has actually been measured -- the first paint,
 * and any environment without layout (jsdom).
 */
export const DEFAULT_PAGE_SIZE = 13;

/**
 * How many whole rows fit in `available` pixels.
 *
 * A zero/unknown `rowHeight` means nothing has been laid out yet, which must
 * not be read as "no rows fit"; the caller keeps the default until there is
 * something real to measure.
 */
export function fitRows(available: number, rowHeight: number): number {
  if (rowHeight <= 0) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.floor(available / rowHeight));
}

/**
 * The number of rows that fit in `containerRef` right now, kept current as the
 * window resizes.
 *
 * Sizing the page to the window (rather than to a fixed count) is what keeps
 * the document from scrolling: a page taller than the viewport pushed the list
 * border under the fixed version footer and buried the "Show More" button
 * below the fold, so it never appeared to do anything.
 *
 * `rowCount` is the number of rows currently rendered -- it re-triggers the
 * measurement when the first rows arrive from the async history load, since
 * before that there is no row to take a height from.
 */
export function useFittedPageSize(
  containerRef: RefObject<HTMLElement | null>,
  reservedPx: number,
  rowCount: number,
): number {
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const measure = useCallback((): void => {
    const el = containerRef.current;
    if (!el) return;
    const row = el.querySelector('.row');
    const rowHeight = row ? row.getBoundingClientRect().height : 0;
    if (rowHeight <= 0) return;
    setPageSize(fitRows(el.clientHeight - reservedPx, rowHeight));
  }, [containerRef, reservedPx]);

  useEffect(() => {
    measure();

    // The observed element is sized by the viewport, not by its content, so
    // adding or removing rows cannot feed back into another measurement.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    const el = containerRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [measure, containerRef, rowCount]);

  return pageSize;
}
