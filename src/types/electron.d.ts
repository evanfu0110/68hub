export type ElectronAPI = {
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  getVersion: () => Promise<string>;
  getName: () => Promise<string>;
  getBackendPort: () => number;
  getBackendToken: () => string;
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => Promise<string>;
    isMaximized: () => Promise<boolean>;
  };
  openExternal: (url: string) => Promise<void>;
  restartBackend: () => Promise<boolean>;
  loginOpenCode: () => Promise<
    | { status: 'ok'; workspace_id: string; auth_cookie: string }
    | { status: 'cancelled' }
    | { status: 'error'; error: string }
  >;
  backendPid: () => Promise<number | null>;
  getTrayMode: () => Promise<boolean>;
  setTrayMode: (v: boolean) => Promise<boolean>;
  closeConfirm: (action: string) => Promise<string>;
  onCloseDialogRequest: (cb: () => void) => () => void;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
