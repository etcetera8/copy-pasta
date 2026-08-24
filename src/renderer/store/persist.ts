import { autorun, runInAction } from 'mobx';
import type { ClipboardStore } from './clipboardStore';
import { clearLegacyLocalStorage, readLegacyLocalStorage } from './migrate';

/**
 * The ~30-line replacement for `mobx-persist`, which is unmaintained and does
 * not work with mobx 6+.
 *
 * Reads the history main owns, imports any pre-Phase-3 localStorage payload if
 * this is the first run on the new format, then mirrors every subsequent change
 * back to main. Writes there are debounced and atomic, so an `autorun` firing
 * on each keystroke-sized change is fine.
 */
export async function hydrateAndPersist(store: ClipboardStore): Promise<void> {
  try {
    const data = await window.copyPasta.loadHistory();
    let items = Array.isArray(data?.items) ? data.items : [];
    const lightTheme = Boolean(data?.lightTheme);

    // Only when main has nothing: a run that already has history must never
    // re-import, and must never clear the legacy key on someone else's behalf.
    if (items.length === 0) {
      const legacy = readLegacyLocalStorage();
      if (legacy?.length) {
        items = legacy;
        await window.copyPasta.saveHistory({ items, lightTheme });
      }
      if (legacy !== null) clearLegacyLocalStorage();
    }

    runInAction(() => {
      store.items = items;
      store.lightTheme = lightTheme;
      store.hydrated = true;
    });
  } catch (error) {
    // Main unreachable (or no history handlers, as in an offscreen render
    // probe). Leave `hydrated` false so the autorun below never writes over
    // history we were unable to read, and let the UI come up empty rather
    // than not at all.
    console.error('copy-pasta: could not load history', error);
  }

  autorun(() => {
    if (!store.hydrated) return;
    void window.copyPasta
      .saveHistory({
        // Plain objects: observables are proxies and the payload is
        // structured-cloned across the IPC boundary.
        items: store.items.map((i) => ({ ...i })),
        lightTheme: store.lightTheme,
      })
      .catch((error) => console.error('copy-pasta: could not save history', error));
  });
}
