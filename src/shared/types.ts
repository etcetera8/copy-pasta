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
 * A published release newer than the running app.
 *
 * The release URL is deliberately absent: `openReleasePage()` takes no
 * argument, so main opens the URL it already holds rather than one the
 * renderer hands it. See the design doc, section 7.
 */
export type UpdateInfo = {
  /** Release tag with any leading `v` stripped -- e.g. "1.1.0". */
  version: string;
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
