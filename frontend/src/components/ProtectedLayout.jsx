import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';

export default function ProtectedLayout({ children, title, eyebrow, sidebarCollapsed = false }) {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail === 'boolean') {
        setFullScreen(event.detail);
      } else {
        setFullScreen((value) => !value);
      }
    };

    window.addEventListener('weds:toggle-fullscreen', handler);
    return () => window.removeEventListener('weds:toggle-fullscreen', handler);
  }, []);

  const hideSidebar = sidebarCollapsed || fullScreen;

  return (
    <div className="min-h-screen w-screen overflow-hidden bg-[#fafafa] text-zinc-900 transition-colors dark:bg-[#09090b] dark:text-zinc-100">
      <div className="flex h-screen w-screen overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#121214]">
        {!hideSidebar ? <Sidebar /> : null}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-[#121214]/80 sm:px-6 lg:px-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-500">{eyebrow || 'Secure workspace'}</p>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title || 'Control center'}</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-600 dark:text-emerald-300 sm:inline-flex">
                Enterprise-grade routing
              </div>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
