import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Settings2, 
  LogOut, 
  Activity, 
  Zap, 
  Terminal, 
  AlertTriangle,
  Sliders,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useProjectStore } from '@/store/useProjectStore';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, activeTab, setActiveTab, clearActiveProject } = useProjectStore();

  const isProjectWorkspace = 
    (location.pathname.includes('/projects/') && location.pathname !== '/projects' && location.pathname !== '/dashboard/projects') ||
    (location.pathname.includes('/dashboard/projects/') && location.pathname !== '/dashboard/projects');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleBackToGlobal = () => {
    clearActiveProject();
    navigate('/dashboard/projects');
  };

  const companyName = user?.company_name || 'Acme Corp';
  const companyInitials = companyName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-cyan-900/20 bg-[#070e14] px-4 py-5 text-zinc-100 font-sans shadow-2xl select-none z-30">
      
      {/* 🚀 1. Official System Logo & Name Header */}
      <div className="flex items-center gap-3 px-2 pb-4 mb-4 border-b border-cyan-900/20">
        <BrandLogo size={32} />
        <div className="truncate flex-1">
          <div className="text-base font-extrabold tracking-tight text-white truncate font-sans">
            EDS ENGINE
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-cyan-500/20 text-[9px] font-bold text-cyan-400 border border-cyan-500/30 shrink-0 font-mono">
              {companyInitials}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium truncate">
              {companyName}
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Navigation Body */}
      {!isProjectWorkspace ? (
        /* 🌐 2. GLOBAL COMPANY SIDEBAR NAVIGATION */
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto custom-scrollbar">
          
          {/* Main Menu Section */}
          <div className="space-y-1">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-cyan-400/80 font-mono">
              MAIN MENU
            </div>

            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                    : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
                }`
              }
            >
              <LayoutDashboard size={17} className="shrink-0 text-cyan-400" />
              <span className="truncate">Company Dashboard</span>
            </NavLink>

            <NavLink
              to="/dashboard/projects"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                    : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
                }`
              }
            >
              <FolderKanban size={17} className="shrink-0 text-cyan-400" />
              <span className="truncate">Project Management</span>
            </NavLink>
          </div>

          {/* System Settings Section */}
          <div className="space-y-1">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-cyan-400/80 font-mono">
              SYSTEM & SECURITY
            </div>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                    : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
                }`
              }
            >
              <Settings2 size={17} className="shrink-0 text-zinc-400" />
              <span className="truncate">Settings & Keys</span>
            </NavLink>
          </div>

        </div>
      ) : (
        /* 🎯 3. PROJECT WORKSPACE SIDEBAR NAVIGATION */
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar">
          
          {/* Back Action Button */}
          <button
            type="button"
            onClick={handleBackToGlobal}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-cyan-400 transition px-2 py-1"
          >
            <ArrowLeft size={14} />
            <span>Back to Projects</span>
          </button>

          {/* Active Workspace Pill */}
          <div className="rounded-xl border border-cyan-900/30 bg-[#0c151e] p-3 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="truncate">
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 font-mono">
                  ACTIVE WORKSPACE
                </div>
                <div className="text-xs font-bold text-white truncate mt-0.5">
                  {activeProject?.name || 'Project Workspace'}
                </div>
              </div>
              <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-bold shrink-0">
                Active
              </span>
            </div>
          </div>

          {/* Project Specific Navigation List */}
          <div className="space-y-1 text-xs">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-cyan-400/80 font-mono">
              PROJECT TELEMETRY
            </div>

            {/* Overview */}
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                  : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
              }`}
            >
              <Activity size={17} className="shrink-0 text-cyan-400" />
              <span className="truncate">Overview & Metrics</span>
            </button>

            {/* Event Config */}
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-all ${
                activeTab === 'events'
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                  : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
              }`}
            >
              <Sliders size={17} className="shrink-0 text-cyan-400" />
              <span className="truncate">Event Config & Rules</span>
            </button>

            {/* Webhook Simulator */}
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-all ${
                activeTab === 'simulator'
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                  : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
              }`}
            >
              <Zap size={17} className="shrink-0 text-amber-400" />
              <span className="truncate">Webhook Simulator</span>
            </button>

            {/* Live Logs */}
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-all ${
                activeTab === 'logs'
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                  : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
              }`}
            >
              <Terminal size={17} className="shrink-0 text-cyan-400" />
              <span className="truncate">Live Logs Explorer</span>
            </button>

            {/* DLQ */}
            <button
              type="button"
              onClick={() => setActiveTab('dlq')}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-all ${
                activeTab === 'dlq'
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                  : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
              }`}
            >
              <AlertTriangle size={17} className="shrink-0 text-rose-400" />
              <span className="truncate">Dead Letter Queue</span>
            </button>

            {/* Security */}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition-all ${
                activeTab === 'settings' || activeTab === 'security'
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/30'
                  : 'text-zinc-400 hover:bg-cyan-500/10 hover:text-white'
              }`}
            >
              <ShieldCheck size={17} className="shrink-0 text-zinc-400" />
              <span className="truncate">Settings & Keys</span>
            </button>
          </div>

        </div>
      )}

      {/* 👤 4. User Profile Footer */}
      <div className="mt-auto border-t border-cyan-900/20 pt-4">
        <div className="flex items-center justify-between rounded-xl border border-cyan-900/30 bg-[#0c151e] p-2.5">
          <div className="flex items-center gap-2.5 truncate">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-600 text-white font-bold text-xs shrink-0 font-mono">
              {user?.email ? user.email.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-white truncate">
                {user?.email || 'Admin Operator'}
              </div>
              <div className="text-[10px] text-zinc-400 capitalize font-mono">
                {user?.role || 'Company Admin'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400 transition"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

    </aside>
  );
}
