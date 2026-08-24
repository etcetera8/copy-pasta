import { app, BrowserWindow, globalShortcut, ipcMain, ipcRenderer, Menu, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import robot from 'robotjs';
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      // Electron 12+ defaults this to true. Phase 1 keeps the renderer exactly
      // as it was (node integration, no bridge); Phase 2 flips both.
      contextIsolation: false,
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
        mainWindow.webContents.send('toggleTheme');
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

// Quit when all windows are closed.
app.on('window-all-closed', (): void => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('hide', () => {
  app.hide();
  robot.keyTap('v', 'command');
});

// Replaces remote.getCurrentWindow().hide(); the remote module was removed in
// Electron 14. Phase 2 moves this behind the preload bridge.
ipcMain.on('window:hide', () => {
  BrowserWindow.getAllWindows()[0]?.hide();
});

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