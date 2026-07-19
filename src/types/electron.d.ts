export type ElectronAPI = {
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  getVersion: () => Promise<string>;
  getName: () => Promise<string>;
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => Promise<string>;
    isMaximized: () => Promise<boolean>;
  };
  openExternal: (url: string) => Promise<void>;
  restartBackend: () => Promise<boolean>;
  backendPid: () => Promise<number | null>;
  getTrayMode: () => Promise<boolean>;
  setTrayMode: (v: boolean) => Promise<boolean>;
  closeConfirm: (action: string) => Promise<string>;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
