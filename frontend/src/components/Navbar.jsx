import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, ChevronRight } from 'lucide-react';
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
    if (p.includes('/settings')) return 'Settings & Security';
    if (p.includes('/logs')) return 'Live Logs Explorer';
    if (p.includes('/dlq')) return 'Dead Letter Queue';
    return 'Company Dashboard';
  };

  const pageTitle = getPageTitle();

  return (
    <header className="sticky top-0 z-20 w-full border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800/80 dark:bg-[#121625]/95 transition-colors font-sans select-none shrink-0">
      <div className="w-full flex h-14 items-center justify-between px-6">
        
        {/* Left Side: Clean Page Title */}
        <div className="flex items-center gap-2 font-sans">
          <span className="text-xs text-zinc-400 font-medium">EDS Engine</span>
          <ChevronRight size={14} className="text-zinc-400" />
          <h1 className="text-sm font-bold text-zinc-900 dark:text-white">{pageTitle}</h1>
        </div>

        {/* Right Side: Theme Toggle, User Profile & Exit */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {/* User Profile Badge */}
          <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800/80 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-sm">
              {user?.email ? user.email.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-zinc-800 dark:text-white truncate max-w-[120px]">
                {user?.company_name || 'Organization'}
              </span>
              <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                {user?.email}
              </span>
            </div>
          </div>

          {/* Exit Button */}
          <button
            type="button"
            onClick={handleLogout}
            title="Exit / Logout"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10 dark:border-zinc-800 dark:bg-zinc-950 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exit</span>
          </button>
        </div>

      </div>
    </header>
  );
}
