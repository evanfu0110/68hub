import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';

const ONBOARDING_KEY = '68hub-onboarded';

export function OnboardingDialog() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const { theme, setTheme } = useTheme();
  const [tray, setTray] = useState(true);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done && ref.current) {
      setShow(true);
      ref.current.showModal();
    }
  }, []);

  const handleFinish = async () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    if (tray && window.electronAPI?.setTrayMode) {
      await window.electronAPI.setTrayMode(true);
    }
    ref.current?.close();
    setShow(false);
  };

  if (!show) return null;

  return (
    <dialog ref={ref} className="modal modal-open" onClose={() => {}}>
      <div className="modal-box max-w-md">
        <h3 className="font-semibold text-base mb-1">{t('onboarding.welcome')}</h3>
        <p className="text-xs text-base-content/50 mb-6">{t('onboarding.subtitle')}</p>

        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium text-base-content/80 mb-2">{t('onboarding.themeLabel')}</div>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((m) => {
                const label = { light: t('settings.light'), dark: t('settings.dark'), system: t('settings.system') }[m];
                return (
                  <button
                    key={m}
                    className={`btn btn-sm flex-1 ${theme === m ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTheme(m)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-base-content/80">{t('onboarding.tray')}</div>
              <div className="text-[11px] text-base-content/40 mt-0.5">{t('onboarding.trayDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={tray}
              onChange={(e) => setTray(e.target.checked)}
            />
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-primary btn-sm" onClick={handleFinish}>
            {t('onboarding.start')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
