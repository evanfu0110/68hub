import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const win = window.electronAPI?.window;
const api = window.electronAPI;

export function TitleBar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleMaximize = async () => {
    win?.maximize();
    if (win?.isMaximized) {
      const max = await win.isMaximized();
      setIsMaximized(max);
    }
  };

  const handleClose = async () => {
    if (!win) return;
    const result = await win.close();
    if (result === 'ask') {
      dialogRef.current?.showModal();
      setShowCloseDialog(true);
    }
  };

  const handleCloseAction = async (action: string) => {
    if (action === 'cancel') {
      dialogRef.current?.close();
      setShowCloseDialog(false);
      return;
    }
    dialogRef.current?.close();
    setShowCloseDialog(false);
    if (api?.closeConfirm) {
      await api.closeConfirm(action);
      window.dispatchEvent(new CustomEvent('tray-mode-changed', { detail: { enabled: action === 'hide' } }));
    }
  };

  return (
    <>
      <div
        className="flex items-center h-[38px] bg-base-200 border-b border-base-300 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center ml-3 gap-2">
          <img src="logo.svg" className="h-[15px]" alt="68hub" />
          <span className="text-xs font-bold text-base-content/60 leading-4">68HUB</span>
          <span className="text-[11px] text-base-content/30 leading-4">{t('app.subtitle')}</span>
        </div>

        <div className="flex-1" />

        <div
          className="flex h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            className="w-[46px] h-full flex items-center justify-center text-base-content/40 hover:bg-base-300 hover:text-base-content transition-colors"
            onClick={() => win?.minimize()}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="w-[46px] h-full flex items-center justify-center text-base-content/40 hover:bg-base-300 hover:text-base-content transition-colors"
            onClick={handleMaximize}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <rect x="0" y="2" width="8" height="8" fill="var(--color-base-200)" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <button
            className="w-[46px] h-full flex items-center justify-center text-base-content/40 hover:bg-red-500 hover:text-white transition-colors"
            onClick={handleClose}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {showCloseDialog && (
        <dialog ref={dialogRef} className="modal modal-open" onClose={() => setShowCloseDialog(false)}>
          <div className="modal-box max-w-sm">
            <h3 className="font-semibold text-base mb-1">{t('titleBar.closeDialogTitle')}</h3>
            <p className="text-xs text-base-content/50 mb-6">{t('titleBar.closeDialogDesc')}</p>
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-primary w-full"
                onClick={() => handleCloseAction('hide')}
              >
                {t('titleBar.minimizeToTray')}
              </button>
              <button
                className="btn btn-ghost w-full"
                onClick={() => handleCloseAction('quit')}
              >
                {t('titleBar.quitApp')}
              </button>
              <button
                className="btn btn-ghost w-full text-base-content/50"
                onClick={() => handleCloseAction('cancel')}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => handleCloseAction('cancel')}>close</button>
          </form>
        </dialog>
      )}
    </>
  );
}
