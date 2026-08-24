import { contextBridge, ipcRenderer } from 'electron';
import type { CopyPastaApi } from '../shared/types';

/**
 * The only bridge between the sandboxed renderer and the main process.
 *
 * Nothing here hands out `ipcRenderer` itself: each member is a closed-over
 * call on a fixed channel, and the two subscription helpers return an
 * unsubscribe function so the renderer can detach its listeners on unmount.
 */
const api: CopyPastaApi = {
  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveHistory: (data) => ipcRenderer.invoke('history:save', data),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),

  onClipboardText: (cb) => {
    const handler = (_e: unknown, text: string): void => cb(text);
    ipcRenderer.on('clipboard:text', handler);
    return () => {
      ipcRenderer.removeListener('clipboard:text', handler);
    };
  },

  onToggleTheme: (cb) => {
    const handler = (): void => cb();
    ipcRenderer.on('theme:toggle', handler);
    return () => {
      ipcRenderer.removeListener('theme:toggle', handler);
    };
  },

  hideWindow: () => ipcRenderer.send('window:hide'),
  hideAndPaste: () => ipcRenderer.send('window:hide-and-paste'),
  getVersion: () => ipcRenderer.invoke('app:version'),
};

contextBridge.exposeInMainWorld('copyPasta', api);
