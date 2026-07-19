import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getName: () => ipcRenderer.invoke('get-app-name'),
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  backendPid: () => ipcRenderer.invoke('backend-pid'),
  getTrayMode: () => ipcRenderer.invoke('get-tray-mode'),
  setTrayMode: (v: boolean) => ipcRenderer.invoke('set-tray-mode', v),
  closeConfirm: (action: string) => ipcRenderer.invoke('close-confirm', action),
});
