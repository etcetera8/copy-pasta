import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import robot from 'robotjs';
import { noteWrite } from './clipboard-watcher';

/**
 * Every channel the preload bridge can reach. Registered once, at module load
 * of `src/main/index.ts` -- `ipcMain.handle` throws on a duplicate channel, so
 * this must not run per window.
 *
 * History handlers (`history:load` / `history:save`) arrive in Phase 3.
 */
export function registerIpc(): void {
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
