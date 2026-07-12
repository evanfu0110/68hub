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
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };
  openExternal: (url: string) => Promise<void>;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
