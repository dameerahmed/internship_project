import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function ProtectedLayout({ children, hideSidebar = false }) {
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

  const shouldHideSidebar = hideSidebar || fullScreen;

  return (
    <div className="h-screen w-screen flex flex-row overflow-hidden bg-[#f4f5f9] text-zinc-900 transition-colors dark:bg-[#0b0e14] dark:text-zinc-100 font-sans antialiased">
      {/* Sidebar: Full height from top to bottom on the left */}
      {!shouldHideSidebar && <Sidebar />}

      {/* Right Content Column */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <Navbar />

        {/* Clean, un-cluttered Main Content View */}
        <main className="flex-1 p-6 w-full max-w-full overflow-y-auto">
          <div className="flex w-full flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
