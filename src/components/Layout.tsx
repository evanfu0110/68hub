import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { OnboardingDialog } from './OnboardingDialog';

export function Layout() {
  const location = useLocation();
  const showLegacyTitleBar = !window.__TAURI__ && Boolean(window.electronAPI);

  return (
    <div className="h-screen flex flex-col bg-base-100 overflow-hidden">
      {showLegacyTitleBar && <TitleBar />}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className={`flex-1 content-area ${showLegacyTitleBar ? 'with-legacy-titlebar' : ''}`} key={location.pathname}>
          <div className="px-3 py-4 pb-24 sm:p-5 md:p-6 md:pb-6 page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <OnboardingDialog />
    </div>
  );
}
