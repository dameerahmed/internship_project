import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, ChevronRight, Search, Bell, LayoutGrid } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getPageTitle = () => {
    const p = location.pathname;
    if (p.includes('/dashboard/projects/')) return 'Project Workspace';
    if (p.includes('/dashboard/projects') || p === '/projects') return 'Project Management';
    if (p.includes('/settings')) return 'Settings & Governance';
    if (p.includes('/logs')) return 'Live Logs Explorer';
    if (p.includes('/dlq')) return 'Dead Letter Queue';
    return 'Company Dashboard';
  };

  const pageTitle = getPageTitle();

  return (
    <header className="sticky top-0 z-20 w-full border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800/80 dark:bg-[#0d1017]/95 transition-colors font-sans select-none shrink-0">
      <div className="w-full flex h-14 items-center justify-between px-6">
        
        {/* Left Side: Clean Search Input & Title */}
        <div className="flex items-center gap-4 font-sans">
          <div className="relative hidden md:block w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium hidden sm:inline">EDS Engine</span>
            <ChevronRight size={14} className="text-zinc-400 hidden sm:inline" />
            <h1 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight">{pageTitle}</h1>
          </div>
        </div>

        {/* Right Side: Action Icons, Theme Toggle, User Profile & Exit */}
        <div className="flex items-center gap-3">
          <button type="button" className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition" title="Grid View">
            <LayoutGrid size={16} />
          </button>

          <button type="button" className="relative p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition" title="Notifications">
            <Bell size={16} />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-indigo-500" />
          </button>

          <ThemeToggle />

          {/* User Profile Badge */}
          <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800/80 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm font-mono">
              {user?.email ? user.email.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-zinc-800 dark:text-white truncate max-w-[120px]">
                {user?.company_name || 'Organization'}
              </span>
              <span className="text-[10px] text-zinc-400 truncate max-w-[120px] font-mono">
                {user?.email}
              </span>
            </div>
          </div>

          {/* Exit Button */}
          <button
            type="button"
            onClick={handleLogout}
            title="Exit / Logout"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10 dark:border-zinc-800 dark:bg-zinc-950 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exit</span>
          </button>
        </div>

      </div>
    </header>
  );
}
