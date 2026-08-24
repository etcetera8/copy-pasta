import { makeAutoObservable } from 'mobx';
import type { Item } from '../../shared/types';

const WEEK_MS = 604800000;

/**
 * The whole of the app's state, over exactly one array.
 *
 * The store this replaces kept four overlapping arrays -- `data`,
 * `searchResults`, `pinnedData`, `unpinnedData` -- and `addData` assigned
 * `unpinnedData = data`, making them the same array object. `pinData`'s
 * `splice` on `unpinnedData` therefore deleted from `data` as well: live data
 * loss on every pin.
 *
 * `items` is now the single source of truth and `pinned` is a flag on the item.
 * Every other collection is a derived getter, so there is nothing left to fall
 * out of sync with anything else.
 */
export class ClipboardStore {
  items: Item[] = [];
  lightTheme = false;

  /** False until main's history has been read; nothing is persisted before then. */
  hydrated = false;

  constructor() {
    makeAutoObservable(this);
  }

  get pinned(): Item[] {
    return this.items.filter((i) => i.pinned);
  }

  get unpinned(): Item[] {
    return this.items.filter((i) => !i.pinned);
  }

  /** Newest first, pinned above unpinned. */
  get ordered(): Item[] {
    const newestFirst = [...this.items].reverse();
    return [...newestFirst.filter((i) => i.pinned), ...newestFirst.filter((i) => !i.pinned)];
  }

  /**
   * Items whose text contains `query`, in display order.
   *
   * A plain substring match, deliberately not a RegExp: the old code built
   * `new RegExp(searchTerm)` from raw input, so typing `(` or `[` threw. There
   * is nothing to escape here.
   */
  results(query: string): Item[] {
    if (!query) return this.ordered;
    const needle = query.toLowerCase();
    return this.ordered.filter((i) => i.text.toLowerCase().includes(needle));
  }

  add(text: string): void {
    if (!text) return;
    // `id` is both the identity key (remove, togglePin, React keys) and the
    // expiry clock, so two captures in the same millisecond must not collide.
    const newest = this.items.reduce((max, i) => (i.id > max ? i.id : max), 0);
    this.items.push({ id: Math.max(Date.now(), newest + 1), text, pinned: false });
  }

  remove(id: number): void {
    this.items = this.items.filter((i) => i.id !== id);
  }

  togglePin(id: number): void {
    const item = this.items.find((i) => i.id === id);
    // Guarded: the old store pushed the result of `find` straight into an
    // array, so a miss stored `undefined`.
    if (item) item.pinned = !item.pinned;
  }

  clear(): void {
    this.items = [];
  }

  toggleTheme(): void {
    this.lightTheme = !this.lightTheme;
  }

  /** Drop unpinned items older than a week. Pinned items never expire. */
  clearExpired(): void {
    const now = Date.now();
    this.items = this.items.filter((i) => i.pinned || now - i.id < WEEK_MS);
  }
}
