import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { OnboardingDialog } from './OnboardingDialog';

export function Layout() {
  const location = useLocation();

  return (
    <div className="h-screen flex flex-col bg-base-100 overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 content-area" key={location.pathname}>
          <div className="p-6 page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <OnboardingDialog />
    </div>
  );
}
