import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, fitRows } from './useFittedPageSize';

/**
 * The page used to be a fixed 13 rows regardless of window size. At the
 * default 800x600 that is roughly 13 rows in a space that holds 5, so the
 * document scrolled, the "Show More" button sat far below the fold, and the
 * list border ran underneath the fixed version footer.
 */
describe('fitRows', () => {
  it('returns how many whole rows fit in the space', () => {
    expect(fitRows(360, 72)).toBe(5);
  });

  it('ignores a partial row that would overflow', () => {
    expect(fitRows(400, 72)).toBe(5); // 5.55 rows -> 5
  });

  it('always leaves room for at least one row', () => {
    expect(fitRows(10, 72)).toBe(1);
    expect(fitRows(0, 72)).toBe(1);
    expect(fitRows(-50, 72)).toBe(1);
  });

  it('falls back to the default when the row height is unknown', () => {
    // jsdom and the first paint both report zero-height elements; measuring
    // then would collapse the list to a single row.
    expect(fitRows(600, 0)).toBe(DEFAULT_PAGE_SIZE);
    expect(fitRows(600, -1)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('scales with the window: a taller list holds more rows', () => {
    expect(fitRows(720, 72)).toBe(10);
    expect(fitRows(1440, 72)).toBe(20);
  });
});
