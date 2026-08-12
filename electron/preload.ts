import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getName: () => ipcRenderer.invoke('get-app-name'),
  getBackendPort: () => ipcRenderer.sendSync('get-backend-port') as number,
  getBackendToken: () => ipcRenderer.sendSync('get-backend-token') as string,
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  loginOpenCode: () => ipcRenderer.invoke('opencode-login-start'),
  backendPid: () => ipcRenderer.invoke('backend-pid'),
  getTrayMode: () => ipcRenderer.invoke('get-tray-mode'),
  setTrayMode: (v: boolean) => ipcRenderer.invoke('set-tray-mode', v),
  closeConfirm: (action: string) => ipcRenderer.invoke('close-confirm', action),
  onCloseDialogRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('close-dialog-request', listener);
    return () => ipcRenderer.removeListener('close-dialog-request', listener);
  },
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
    ipcRenderer.on('window-maximized-changed', listener);
    return () => ipcRenderer.removeListener('window-maximized-changed', listener);
  },
});
