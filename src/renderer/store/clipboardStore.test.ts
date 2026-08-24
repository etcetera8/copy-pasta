import { describe, expect, it } from 'vitest';
import { ClipboardStore } from './clipboardStore';

const WEEK_MS = 604800000;

describe('ClipboardStore', () => {
  it('ignores empty captures', () => {
    const s = new ClipboardStore();
    s.add('');
    expect(s.items).toHaveLength(0);
  });

  it('gives every capture a distinct id even back to back', () => {
    const s = new ClipboardStore();
    s.add('one');
    s.add('two');
    s.add('three');

    const ids = s.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('orders newest first with pinned above unpinned', () => {
    const s = new ClipboardStore();
    s.add('oldest');
    s.add('middle');
    s.add('newest');
    s.togglePin(s.items[0].id); // pin 'oldest'

    expect(s.ordered.map((i) => i.text)).toEqual(['oldest', 'newest', 'middle']);
  });

  // Was `dataStore.test.ts` -> `it.fails('BUG 1: pinning an item should not
  // delete it from data')`. The legacy store aliased `unpinnedData` to `data`,
  // so pinning spliced the item out of both. Now an ordinary assertion.
  it('BUG 1: pinning keeps the item and does not drop others', () => {
    const s = new ClipboardStore();
    s.add('alpha');
    s.add('beta');

    s.togglePin(s.items[0].id);

    expect(s.items).toHaveLength(2);
    expect(s.items.map((i) => i.text).sort()).toEqual(['alpha', 'beta']);
  });

  // Was `dataStore.test.ts` -> `it.fails('BUG 1b: data and unpinnedData must
  // not be the same array object')`. `unpinned` is a derived view now, so the
  // splice that used to destroy `data` cannot reach the source of truth.
  it('BUG 1b: the unpinned view is not the items array itself', () => {
    const s = new ClipboardStore();
    s.add('gamma');

    expect(s.unpinned).not.toBe(s.items);

    s.unpinned.splice(0, 1);
    expect(s.items).toHaveLength(1);
  });

  it('unpinning restores the item exactly once', () => {
    const s = new ClipboardStore();
    s.add('alpha');
    s.add('beta');
    const id = s.items[0].id;

    s.togglePin(id);
    s.togglePin(id);

    expect(s.items).toHaveLength(2);
    expect(s.items.filter((i) => i.text === 'alpha')).toHaveLength(1);
    expect(s.pinned).toHaveLength(0);
    expect(s.unpinned).toHaveLength(2);
  });

  it('ignores a pin toggle for an unknown id', () => {
    const s = new ClipboardStore();
    s.add('alpha');

    expect(() => s.togglePin(-1)).not.toThrow();
    expect(s.items).toHaveLength(1);
    expect(s.pinned).toHaveLength(0);
  });

  it('pinned and unpinned partition items exactly', () => {
    const s = new ClipboardStore();
    s.add('a');
    s.add('b');
    s.add('c');
    s.togglePin(s.items[1].id);

    expect(s.pinned).toHaveLength(1);
    expect(s.unpinned).toHaveLength(2);
    expect(s.pinned.length + s.unpinned.length).toBe(s.items.length);
    expect([...s.pinned, ...s.unpinned].map((i) => i.text).sort()).toEqual(['a', 'b', 'c']);
  });

  it('removes only the requested item', () => {
    const s = new ClipboardStore();
    s.add('a');
    s.add('b');

    s.remove(s.items[0].id);

    expect(s.items.map((i) => i.text)).toEqual(['b']);
  });

  it('treats regex metacharacters in search as literal text', () => {
    const s = new ClipboardStore();
    s.add('call foo(bar)');

    expect(() => s.results('(')).not.toThrow();
    expect(() => s.results('[')).not.toThrow();
    expect(() => s.results('*')).not.toThrow();
    expect(s.results('(bar)')).toHaveLength(1);
    expect(s.results('[')).toHaveLength(0);
    expect(s.results('*')).toHaveLength(0);
  });

  it('matches a literal asterisk rather than using it as a quantifier', () => {
    const s = new ClipboardStore();
    s.add('2 * 3');
    s.add('plain text');

    expect(s.results('*').map((i) => i.text)).toEqual(['2 * 3']);
  });

  it('searches case-insensitively and returns everything for an empty query', () => {
    const s = new ClipboardStore();
    s.add('Hello World');

    expect(s.results('hello world')).toHaveLength(1);
    expect(s.results('')).toEqual(s.ordered);
  });

  it('expires old unpinned items but never pinned ones', () => {
    const s = new ClipboardStore();
    const old = Date.now() - 8 * 86400000;
    s.items = [
      { id: old, text: 'stale', pinned: false },
      { id: old, text: 'kept', pinned: true },
    ];

    s.clearExpired();

    expect(s.items.map((i) => i.text)).toEqual(['kept']);
  });

  it('keeps unpinned items that are not yet a week old', () => {
    const s = new ClipboardStore();
    s.items = [
      { id: Date.now() - (WEEK_MS - 60000), text: 'fresh', pinned: false },
      { id: Date.now() - (WEEK_MS + 60000), text: 'stale', pinned: false },
    ];

    s.clearExpired();

    expect(s.items.map((i) => i.text)).toEqual(['fresh']);
  });

  it('clear() empties everything', () => {
    const s = new ClipboardStore();
    s.add('a');
    s.togglePin(s.items[0].id);

    s.clear();

    expect(s.items).toHaveLength(0);
    expect(s.pinned).toHaveLength(0);
    expect(s.unpinned).toHaveLength(0);
  });

  it('toggleTheme flips lightTheme', () => {
    const s = new ClipboardStore();
    expect(s.lightTheme).toBe(false);

    s.toggleTheme();
    expect(s.lightTheme).toBe(true);

    s.toggleTheme();
    expect(s.lightTheme).toBe(false);
  });
});
