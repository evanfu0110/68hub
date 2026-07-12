import { useState } from 'react';

const win = window.electronAPI?.window;

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMaximize = async () => {
    win?.maximize();
    if (win?.isMaximized) {
      const max = await win.isMaximized();
      setIsMaximized(max);
    }
  };

  return (
    <div
      className="flex items-center h-[38px] bg-base-200 border-b border-base-300 shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center ml-3 gap-2">
        <img src="logo.svg" className="h-[15px]" alt="68hub" />
        <span className="text-xs font-bold text-base-content/60 leading-4">68HUB</span>
        <span className="text-[11px] text-base-content/30 leading-4">- OpenCode Go Manager</span>
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
          onClick={() => win?.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
