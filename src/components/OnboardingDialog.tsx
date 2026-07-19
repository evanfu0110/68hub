import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeProvider';

const ONBOARDING_KEY = '68hub-onboarded';

export function OnboardingDialog() {
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
        <h3 className="font-semibold text-base mb-1">欢迎使用 68HUB</h3>
        <p className="text-xs text-base-content/50 mb-6">选择偏好的外观和系统行为</p>

        <div className="space-y-5">
          {/* 主题 */}
          <div>
            <div className="text-sm font-medium text-base-content/80 mb-2">界面主题</div>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => {
                const label = { light: '浅色', dark: '深色', system: '跟随系统' }[t];
                return (
                  <button
                    key={t}
                    className={`btn btn-sm flex-1 ${theme === t ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTheme(t)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 托盘 */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-base-content/80">最小化到系统托盘</div>
              <div className="text-[11px] text-base-content/40 mt-0.5">关闭窗口时隐藏到托盘，而非退出</div>
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
            开始使用
          </button>
        </div>
      </div>
    </dialog>
  );
}
