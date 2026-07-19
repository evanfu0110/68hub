import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  isBackendRunning,
  restartBackendServer,
  startBackendServer,
  stopBackendServer,
} from './backend/server';

app.commandLine.appendSwitch('disable-features', 'Autofill');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayMode = false;
let trayConfigured = false;

const BACKEND_PORT = 8788;
const BACKEND_HOST = '127.0.0.1';

function trayConfigPath(): string {
  return path.join(app.getPath('userData'), 'tray.json');
}

function saveTrayPreference(mode: boolean, configured: boolean) {
  trayMode = mode;
  trayConfigured = configured;
  try {
    fs.mkdirSync(path.dirname(trayConfigPath()), { recursive: true });
    fs.writeFileSync(trayConfigPath(), JSON.stringify({ trayMode: mode, trayConfigured: configured }), 'utf-8');
  } catch {
    // ignore
  }
}

function loadTrayPreference() {
  try {
    const raw = fs.readFileSync(trayConfigPath(), 'utf-8');
    const data = JSON.parse(raw);
    trayMode = data.trayMode === true;
    trayConfigured = data.trayConfigured === true;
  } catch {
    trayMode = false;
    trayConfigured = false;
  }
}

function backendDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

async function startBackend() {
  try {
    await startBackendServer({
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      dataDir: backendDataDir(),
    });
  } catch (err) {
    console.error('[backend] failed to start:', err);
  }
}

async function stopBackend() {
  try {
    await stopBackendServer();
  } catch (err) {
    console.error('[backend] failed to stop:', err);
  }
}

function createTray() {
  if (!trayMode) return;
  if (tray) return;

  const iconPath = path.join(__dirname, isDev ? '../public/icon.png' : '../dist/icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty icon');
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('68HUB');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        trayMode = false;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, isDev ? '../favicon.ico' : '../dist/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on('close', (event) => {
    if (trayMode) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-name', () => app.getName());

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window-close', async () => {
  if (trayMode) {
    mainWindow?.hide();
    return 'hide';
  }
  if (!trayConfigured) {
    return 'ask';
  }
  mainWindow?.close();
  return 'quit';
});

ipcMain.handle('close-confirm', async (_event, action: string) => {
  if (action === 'hide') {
    saveTrayPreference(true, true);
    createTray();
    mainWindow?.hide();
    return 'hide';
  }
  saveTrayPreference(false, true);
  mainWindow?.close();
  return 'quit';
});

ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('restart-backend', async () => {
  await restartBackendServer({
    host: BACKEND_HOST,
    port: BACKEND_PORT,
    dataDir: backendDataDir(),
  });
  return true;
});

ipcMain.handle('backend-pid', () => {
  return isBackendRunning() ? process.pid : null;
});

ipcMain.handle('get-tray-mode', () => trayMode);

ipcMain.handle('set-tray-mode', (_event, v: boolean) => {
  saveTrayPreference(v, true);
  if (v) {
    createTray();
  } else {
    destroyTray();
  }
  return true;
});

app.whenReady().then(async () => {
  loadTrayPreference();
  await startBackend();
  createWindow();
  if (trayMode) createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  void stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void stopBackend();
  destroyTray();
});

app.on('will-quit', () => {
  void stopBackend();
  destroyTray();
});
