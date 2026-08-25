import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { startClipboardWatcher, stopClipboardWatcher } from './clipboard-watcher';
import { flush } from './history-store';
import { registerIpc } from './ipc';
// Injected by @electron-forge/plugin-vite.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let appIcon = null;
const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    webPreferences: {
      // Forge's Vite plugin emits both bundles into `.vite/build`, so the
      // preload sits next to the main bundle rather than in `../preload/`.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
    frame: false,
    fullscreenable: true,
    center: true,
    movable: true,
    resizable: true,
    show: false,
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Focus Copy Pasta',
      accelerator: 'Command+Shift+V',
      click: (): void => {
        app.show();
      }
    },
    { type: 'separator' },
    {
      label: 'Toggle Light/Dark Mode',
      click: (): void => {
        mainWindow.webContents.send('theme:toggle');
      }
    },
    { type: 'separator' },
    {
      label: 'Toggle Developer Tools',
      accelerator: 'Alt+Command+I',
      click: (): void => {
        mainWindow.webContents.openDevTools();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'Command+Q',
      click: (): void => {
        app.quit();
      }
    }
  ]);

  // A macOS template image: black artwork plus an alpha mask, which the OS
  // recolours itself -- white against a dark menu bar, black against a light
  // one, and inverted while the menu is open. `createFromPath` also picks up
  // the `@2x` file sitting beside this one, so the icon stays sharp on Retina
  // instead of being upscaled from 16px.
  const icon = nativeImage.createFromPath(path.join(__dirname, 'bowlTemplate.png'));
  icon.setTemplateImage(true);
  appIcon = new Tray(icon);
  appIcon.setToolTip('Copy pasta');
  appIcon.setContextMenu(contextMenu);
  globalShortcut.register('CommandOrControl+Shift+V', (): void => {
    mainWindow.show();
  })

  // Clipboard capture belongs to main now: a sandboxed renderer cannot poll the
  // system clipboard itself. New text arrives in the renderer as `clipboard:text`.
  startClipboardWatcher();

  //#region auto-updater
  // The `document` / `ipcRenderer` block that used to sit here (bug 10) is
  // gone. It was renderer code running in main, so `createWindow` threw a
  // ReferenceError every launch -- and Electron's default handler for an
  // uncaught main-process exception is a modal NSAlert, which `app.dock.hide()`
  // keeps off screen. The main process sat wedged behind an invisible dialog
  // and answered no IPC at all, so the window stayed blank and `history:load`
  // never resolved. Phase 5 owns rendering the version string in the renderer;
  // this phase only removes what cannot run here, because history cannot
  // survive a restart while main is deadlocked.
  //
  // Update checks stay dormant: there is no publish provider configured, so
  // `checkForUpdatesAndNotify()` would emit an unhandled `error` and wedge the
  // app the same way. These two listeners are inert until Phase 5 wires it up.
  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
  });
  //#endregion
};


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Set once we have taken over the quit, so the second `will-quit` that
// `app.exit()` could raise is not blocked a second time.
let quitting = false;

app.on('will-quit', (event): void => {
  stopClipboardWatcher();
  if (quitting) return;
  quitting = true;

  // History writes are debounced, so the last capture may still be queued.
  // Hold the quit just long enough to land it.
  event.preventDefault();
  void flush().finally(() => app.exit());
});

// Quit when all windows are closed.
app.on('window-all-closed', (): void => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Every ipcMain handler now lives in ./ipc, reached only through the preload
// bridge. Registered at module load: `ipcMain.handle` rejects a duplicate
// channel, so it must not be per window.
registerIpc();

if (process.platform === 'darwin') {
  // Typed optional because `dock` only exists on macOS.
  app.dock?.hide();
}
app.on('activate', (): void => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});