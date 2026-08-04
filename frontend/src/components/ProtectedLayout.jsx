import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function ProtectedLayout({ children, hideSidebar = false }) {
  const [fullScreen, setFullScreen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Fullscreen event listener (used by log/simulator tabs)
  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail === 'boolean') {
        setFullScreen(event.detail);
      } else {
        setFullScreen((v) => !v);
      }
    };
    window.addEventListener('weds:toggle-fullscreen', handler);
    return () => window.removeEventListener('weds:toggle-fullscreen', handler);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [children]);

  const shouldHideSidebar = hideSidebar || fullScreen;

  return (
    <div className="h-screen w-screen flex flex-row overflow-hidden font-display antialiased select-none"
         style={{ background: 'var(--eds-bg)', color: 'var(--eds-text)' }}>

      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      {!shouldHideSidebar && (
        <div className="hidden md:flex shrink-0">
          <Sidebar />
        </div>
      )}

      {/* ── Mobile Sidebar Overlay ───────────────────────────────────── */}
      {!shouldHideSidebar && mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Slide-in sidebar */}
          <div className="fixed inset-y-0 left-0 z-50 md:hidden animate-slide-in-left">
            <Sidebar onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* ── Right Content Column ────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden"
           style={{ background: 'var(--eds-surface)' }}>

        {/* Top Navbar — passes mobile toggle handler */}
        <Navbar onMobileMenuToggle={() => setMobileSidebarOpen((v) => !v)} />

        {/* Main scrollable content area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="page-enter w-full max-w-[1600px] mx-auto px-5 py-6 lg:px-8 lg:py-8 flex flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
