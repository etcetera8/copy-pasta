import { app, BrowserWindow, globalShortcut, ipcRenderer, Menu, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { startClipboardWatcher, stopClipboardWatcher } from './clipboard-watcher';
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

  const iconPath = path.join(__dirname, 'bowl.png');
  appIcon = new Tray(iconPath);
  appIcon.setToolTip('Copy pasta');
  appIcon.setContextMenu(contextMenu);
  globalShortcut.register('CommandOrControl+Shift+V', (): void => {
    mainWindow.show();
  })

  // Clipboard capture belongs to main now: a sandboxed renderer cannot poll the
  // system clipboard itself. New text arrives in the renderer as `clipboard:text`.
  startClipboardWatcher();

  //#region auto-updater
  const version = document.getElementById('version');
  
  ipcRenderer.send('app_version');
  ipcRenderer.on('app_version', (event, arg) => {
    ipcRenderer.removeAllListeners('app_version');
    version.innerText = 'Version ' + arg.version;
  });
  
  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify();
  })

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
  });autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
  });
  //#endregion
};


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

app.on('will-quit', (): void => {
  stopClipboardWatcher();
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

if (process.platform == 'darwin') {
  app.dock.hide();
}
app.on('activate', (): void => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});