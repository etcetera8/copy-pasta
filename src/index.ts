import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain } from 'electron';
import path from 'path';
import robot from 'robotjs';
declare const MAIN_WINDOW_WEBPACK_ENTRY: any;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

let appIcon = null;
const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      devTools: true,
    },
    frame: false,
    fullscreenable: false,
    center: true,
    movable: false,
    resizable: false,
    show: false,
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

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
    // {
    //   label: 'Toggle Developer Tools',
    //   accelerator: 'Alt+Command+I',
    //   click: (): void => {
    //     mainWindow.webContents.openDevTools();
    //   }
    // },
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
