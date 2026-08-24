import { BrowserWindow, clipboard } from 'electron';

const POLL_MS = 500;

/**
 * Text the watcher has already accounted for. Module level rather than local to
 * `startClipboardWatcher` so `noteWrite` can update it: when the app itself
 * puts text on the clipboard (the user picked an item) the next poll would
 * otherwise read that text back and report it as a fresh capture.
 */
let last = '';
let timer: NodeJS.Timeout | null = null;

/** Record a clipboard write made by the app so it is not echoed back. */
export function noteWrite(text: string): void {
  last = text;
}

/**
 * Poll the system clipboard and push new text to every renderer.
 *
 * Replaces `electron-clipboard-extended` (unmaintained since 2022, and a
 * renderer-side listener cannot survive contextIsolation).
 *
 * @returns a function that stops the watcher.
 */
export function startClipboardWatcher(): () => void {
  // `createWindow` runs again on macOS `activate`, so make restarting safe
  // rather than leaking the previous interval.
  stopClipboardWatcher();

  // Whatever is on the clipboard when the app starts is not a new capture.
  last = clipboard.readText();

  timer = setInterval(() => {
    const text = clipboard.readText();
    if (!text || text === last) return;

    last = text;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('clipboard:text', text);
    }
  }, POLL_MS);

  return stopClipboardWatcher;
}

export function stopClipboardWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
