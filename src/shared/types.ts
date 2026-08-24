export type Item = {
  id: number;
  text: string;
  pinned: boolean;
};

/** Persisted history payload, owned by the main process (Phase 3). */
export type HistoryData = {
  items: Item[];
  lightTheme: boolean;
};

/**
 * The one and only surface the renderer has on anything privileged.
 *
 * Exposed on `window.copyPasta` by `src/preload/index.ts` through
 * `contextBridge`. Raw `ipcRenderer` is never handed out; subscription helpers
 * return an unsubscribe function so the renderer can tear them down.
 */
export type CopyPastaApi = {
  loadHistory: () => Promise<HistoryData>;
  saveHistory: (data: HistoryData) => Promise<void>;
  writeClipboard: (text: string) => Promise<void>;
  onClipboardText: (cb: (text: string) => void) => () => void;
  onToggleTheme: (cb: () => void) => () => void;
  hideWindow: () => void;
  hideAndPaste: () => void;
  getVersion: () => Promise<string>;
};

declare global {
  interface Window {
    copyPasta: CopyPastaApi;
  }
}
