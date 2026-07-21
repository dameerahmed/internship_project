import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, FolderKanban, ScrollText, Settings2, LogOut } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { to: '/projects', label: 'Projects Setup', icon: FolderKanban },
  { to: '/logs', label: 'System Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-200 bg-[#fafafa] px-4 py-4 dark:border-zinc-800 dark:bg-[#121214]">
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <BrandLogo size={40} />
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">WEDS</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">v2.4.0 • Stable</div>
        </div>
      </div>

      <nav className="mt-5 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70'}`
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {user?.company_name || 'Workspace'}
        </div>
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user?.email || 'Signed in securely'}</div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" onClick={() => navigate('/settings')}>
            Manage
          </button>
          <button type="button" className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" onClick={handleLogout}>
            <span className="inline-flex items-center gap-2">
              <LogOut size={15} />
              Exit
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
