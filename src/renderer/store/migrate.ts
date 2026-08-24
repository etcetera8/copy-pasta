import type { Item } from '../../shared/types';

/** Where `mobx-persist`'s `hydrate('data', DataStore)` used to write. */
const LEGACY_KEY = 'data';

/**
 * Read the pre-Phase-3 history out of renderer localStorage.
 *
 * The legacy payload held four overlapping arrays; only `data` and `pinnedData`
 * carried anything worth keeping. They are flattened into one list with a
 * `pinned` flag and de-duplicated by `id` -- the two arrays overlapped, since
 * a pinned item was pushed onto `pinnedData` while (usually) still sitting in
 * `data`.
 *
 * This has to run in the renderer: localStorage belongs to the page's origin
 * and main cannot reach it. The result goes to main via `saveHistory`.
 *
 * @returns the recovered items, or `null` if there is nothing to migrate or
 * the stored payload is unreadable. It never throws -- failing to import
 * six-year-old history must not stop the app from starting.
 */
export function readLegacyLocalStorage(): Item[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const pinnedIds = new Set((parsed.pinnedData ?? []).map((i: any) => i?.id));
    const all = [...(parsed.data ?? []), ...(parsed.pinnedData ?? [])];

    const seen = new Set<number>();
    const items: Item[] = [];
    for (const entry of all) {
      if (!entry || typeof entry.id !== 'number' || seen.has(entry.id)) continue;
      seen.add(entry.id);
      items.push({
        id: entry.id,
        text: String(entry.text ?? ''),
        pinned: pinnedIds.has(entry.id),
      });
    }
    return items;
  } catch {
    return null;
  }
}

/** Forget the legacy payload so the migration only ever runs once. */
export function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage being unavailable is not worth failing a startup over.
  }
}
