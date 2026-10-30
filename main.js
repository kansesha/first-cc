const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

app.setAppUserModelId('com.example.pomodoro');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    frame: false,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    show: false,
    skipTaskbar: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 注意：不拦截 close 事件，点 ✕ / Alt+F4 都直接退出应用，
  // 需要常驻时请用「─」最小化，或从托盘恢复。
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip('番茄钟');
  const menu = Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏',
      click: () => (mainWindow.isVisible() ? mainWindow.hide() : showWindow()),
    },
    {
      label: '开始 / 暂停',
      click: () => mainWindow.webContents.send('tray:toggle'),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => (mainWindow.isVisible() ? mainWindow.hide() : showWindow()));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ---- IPC ----
ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: ICON_PATH }).show();
  }
});

ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:quit', () => app.quit());

ipcMain.handle('window:toggle-pin', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next);
  return next;
});

ipcMain.handle('window:is-pinned', () => (mainWindow ? mainWindow.isAlwaysOnTop() : false));
