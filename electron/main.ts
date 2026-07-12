import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { ChildProcess, spawn, execSync } from 'child_process';
import path from 'path';

app.commandLine.appendSwitch('disable-features', 'Autofill');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const BACKEND_PORT = 8788;
const BACKEND_HOST = '127.0.0.1';

function backendPath(): string {
  if (isDev) return '';
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(process.resourcesPath, 'backend', `68backend${ext}`);
}

function killProcessTree(pid: number) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    // process already dead
  }
}

function startBackend() {
  const binPath = backendPath();
  if (!binPath) return;

  const env = {
    ...process.env,
    '68BACKEND_DATA': path.join(app.getPath('userData'), 'data'),
    '68BACKEND_LISTEN_HOST': BACKEND_HOST,
    '68BACKEND_LISTEN_PORT': String(BACKEND_PORT),
  };

  backendProcess = spawn(binPath, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    console.error(`[backend] error: ${err.message}`);
  });
}

function stopBackend() {
  if (backendProcess && backendProcess.pid) {
    killProcessTree(backendProcess.pid);
    backendProcess = null;
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    startBackend();
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
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('restart-backend', () => {
  stopBackend();
  startBackend();
  return true;
});

ipcMain.handle('backend-pid', () => {
  return backendProcess?.pid ?? null;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});
