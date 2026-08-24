import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import robot from 'robotjs';
import type { HistoryData } from '../shared/types';
import { noteWrite } from './clipboard-watcher';
import { load, save } from './history-store';

/**
 * Every channel the preload bridge can reach. Registered once, at module load
 * of `src/main/index.ts` -- `ipcMain.handle` throws on a duplicate channel, so
 * this must not run per window.
 */
export function registerIpc(): void {
  // History lives in `userData/history.json`, owned by main. localStorage was
  // origin-scoped, so a dev-server port change silently orphaned it.
  ipcMain.handle('history:load', () => load());

  ipcMain.handle('history:save', (_e, data: HistoryData) => {
    // Debounced and written atomically inside the store; nothing to await.
    save(data);
  });

  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(text);
    // Tell the watcher this text came from us, so it is not re-captured.
    noteWrite(text);
  });

  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.on('window:hide', () => {
    BrowserWindow.getAllWindows()[0]?.hide();
  });

  ipcMain.on('window:hide-and-paste', () => {
    app.hide();
    robot.keyTap('v', 'command');
  });
}
