// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readLegacyLocalStorage } from './migrate';

beforeEach(() => {
  localStorage.clear();
});

describe('readLegacyLocalStorage', () => {
  it('flattens data + pinnedData and marks pinned correctly', () => {
    localStorage.setItem(
      'data',
      JSON.stringify({
        data: [
          { id: 1, text: 'a' },
          { id: 2, text: 'b' },
        ],
        pinnedData: [{ id: 2, text: 'b' }],
      }),
    );

    const items = readLegacyLocalStorage();

    expect(items).toHaveLength(2); // de-duplicated by id
    expect(items.find((i) => i.id === 2).pinned).toBe(true);
    expect(items.find((i) => i.id === 1).pinned).toBe(false);
  });

  it('keeps a pinned item that only exists in pinnedData', () => {
    localStorage.setItem(
      'data',
      JSON.stringify({
        data: [{ id: 1, text: 'a' }],
        pinnedData: [{ id: 3, text: 'c' }],
      }),
    );

    const items = readLegacyLocalStorage();

    expect(items.map((i) => i.id).sort()).toEqual([1, 3]);
    expect(items.find((i) => i.id === 3).pinned).toBe(true);
  });

  it('drops the legacy date and searchIndex fields', () => {
    localStorage.setItem(
      'data',
      JSON.stringify({
        data: [{ id: 1, text: 'a', date: '1:00:00 PM - 8/23', searchIndex: 'a' }],
      }),
    );

    expect(readLegacyLocalStorage()).toEqual([{ id: 1, text: 'a', pinned: false }]);
  });

  it('skips entries without a numeric id', () => {
    localStorage.setItem(
      'data',
      JSON.stringify({
        data: [{ id: 1, text: 'a' }, { text: 'no id' }, null, { id: '2', text: 'string id' }],
      }),
    );

    expect(readLegacyLocalStorage()).toEqual([{ id: 1, text: 'a', pinned: false }]);
  });

  it('returns an empty list when the payload has neither array', () => {
    localStorage.setItem('data', JSON.stringify({ lightTheme: true }));

    expect(readLegacyLocalStorage()).toEqual([]);
  });

  it('returns null instead of throwing on corrupt input', () => {
    localStorage.setItem('data', '{not json');

    expect(readLegacyLocalStorage()).toBeNull();
  });

  it('returns null instead of throwing when the payload is not an object', () => {
    localStorage.setItem('data', '"just a string"');

    expect(readLegacyLocalStorage()).toBeNull();
  });

  it('returns null when there is nothing to migrate', () => {
    localStorage.removeItem('data');

    expect(readLegacyLocalStorage()).toBeNull();
  });
});
