import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderGit2,
  KeyRound,
  LogOut,
  BarChart3,
  SlidersHorizontal,
  Send,
  Terminal,
  Inbox,
  ArrowLeft,
  X,
  ShieldCheck,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useProjectStore } from '@/store/useProjectStore';

const navItemBase =
  'flex items-center gap-3 rounded-eds px-3 py-2.5 text-xs font-semibold transition-all duration-150 w-full text-left';

function NavItem({ to, icon: Icon, iconColor, label, onClick, isActive: forceActive }) {
  // Determine whether to use NavLink (route-based) or button (tab-based)
  if (to) {
    return (
      <NavLink
        to={to}
        end={to === '/dashboard'}
        className={({ isActive }) =>
          `${navItemBase} ${
            isActive || forceActive
              ? 'border-l-2 pl-[calc(0.75rem_-_2px)]'
              : 'border-l-2 border-transparent'
          }`
        }
        style={({ isActive }) =>
          isActive || forceActive
            ? {
                borderLeftColor: 'var(--eds-accent)',
                background: 'var(--eds-accent-dim)',
                color: 'var(--eds-accent-2)',
              }
            : { color: 'var(--eds-muted)' }
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              size={16}
              className="shrink-0 transition-colors"
              style={{ color: isActive || forceActive ? 'var(--eds-accent-2)' : iconColor || 'var(--eds-muted)' }}
            />
            <span className="truncate">{label}</span>
          </>
        )}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${navItemBase} border-l-2 ${forceActive ? 'pl-[calc(0.75rem_-_2px)]' : 'border-transparent'}`}
      style={
        forceActive
          ? {
              borderLeftColor: 'var(--eds-accent)',
              background: 'var(--eds-accent-dim)',
              color: 'var(--eds-accent-2)',
            }
          : { color: 'var(--eds-muted)' }
      }
    >
      <Icon
        size={16}
        className="shrink-0 transition-colors"
        style={{ color: forceActive ? 'var(--eds-accent-2)' : iconColor || 'var(--eds-muted)' }}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="px-3 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-[0.14em] font-mono"
         style={{ color: 'var(--eds-faint)' }}>
      {children}
    </div>
  );
}

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, activeTab, setActiveTab, clearActiveProject } = useProjectStore();

  const isProjectWorkspace =
    (location.pathname.includes('/projects/') &&
      location.pathname !== '/projects' &&
      location.pathname !== '/dashboard/projects') ||
    (location.pathname.includes('/dashboard/projects/') &&
      location.pathname !== '/dashboard/projects');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleBackToGlobal = () => {
    clearActiveProject();
    navigate('/dashboard/projects');
  };

  const companyName = user?.company_name || 'Your Organization';
  const companyInitials = companyName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const userInitials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'US';

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col font-display select-none"
      style={{
        background: 'var(--eds-surface)',
        borderRight: '1px solid var(--eds-border)',
      }}
    >

      {/* ── 1. Logo Header ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--eds-border)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandLogo size={30} />
          <div className="min-w-0 truncate">
            <div className="text-sm font-extrabold tracking-tight truncate"
                 style={{ color: 'var(--eds-text)' }}>
              EDS ENGINE
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="flex h-4 w-auto items-center justify-center rounded px-1.5 text-[9px] font-bold font-mono shrink-0"
                style={{
                  background: 'var(--eds-accent-dim)',
                  border: '1px solid var(--eds-accent-ring)',
                  color: 'var(--eds-accent-2)',
                }}
              >
                {companyInitials}
              </span>
              <span className="text-[11px] truncate font-medium" style={{ color: 'var(--eds-muted)' }}>
                {companyName}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden rounded-eds p-1.5 transition-colors shrink-0"
            style={{ color: 'var(--eds-muted)' }}
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── 2. Navigation Body ─────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">

        {!isProjectWorkspace ? (
          /* ── GLOBAL NAVIGATION ───── */
          <div className="flex flex-col gap-5">
            <div className="space-y-0.5">
              <SectionLabel>Main Menu</SectionLabel>
              <NavItem to="/dashboard"            icon={LayoutDashboard} label="Company Dashboard" />
              <NavItem to="/dashboard/projects"   icon={FolderGit2}      label="Project Management" />
            </div>

            <div className="space-y-0.5">
              <SectionLabel>System & Security</SectionLabel>
              <NavItem to="/settings" icon={KeyRound} label="Settings & Keys" iconColor="var(--eds-accent-2)" />
            </div>
          </div>

        ) : (
          /* ── PROJECT WORKSPACE NAVIGATION ──── */
          <div className="flex flex-col gap-4">
            {/* Back button */}
            <button
              type="button"
              onClick={handleBackToGlobal}
              className="flex items-center gap-2 text-xs font-semibold transition-colors px-1 py-1"
              style={{ color: 'var(--eds-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--eds-accent-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--eds-muted)'; }}
            >
              <ArrowLeft size={13} />
              <span>Back to Projects</span>
            </button>

            {/* Active Workspace Pill */}
            <div
              className="rounded-eds p-3"
              style={{
                background: 'var(--eds-panel)',
                border: '1px solid var(--eds-border-2)',
              }}
            >
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] font-mono mb-1"
                   style={{ color: 'var(--eds-accent-2)' }}>
                Active Workspace
              </div>
              <div className="text-xs font-bold truncate" style={{ color: 'var(--eds-text)' }}>
                {activeProject?.name || 'Project Workspace'}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ background: 'var(--eds-success)' }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5"
                        style={{ background: 'var(--eds-success)' }} />
                </span>
                <span className="text-[10px] font-bold font-mono" style={{ color: 'var(--eds-success)' }}>
                  Live
                </span>
              </div>
            </div>

            {/* Project tabs navigation */}
            <div className="space-y-0.5">
              <SectionLabel>Project Telemetry</SectionLabel>
              <NavItem icon={BarChart3}        label="Overview & Metrics"    isActive={activeTab === 'overview'}  onClick={() => setActiveTab('overview')} />
              <NavItem icon={SlidersHorizontal} label="Event Config & Rules"  isActive={activeTab === 'events'}    onClick={() => setActiveTab('events')} />
              <NavItem icon={Send}              label="Webhook Simulator"      isActive={activeTab === 'simulator'} onClick={() => setActiveTab('simulator')} iconColor="var(--eds-warning)" />
              <NavItem icon={Terminal}          label="Live Logs Explorer"     isActive={activeTab === 'logs'}      onClick={() => setActiveTab('logs')} />
              <NavItem icon={Inbox}             label="Dead Letter Queue"      isActive={activeTab === 'dlq'}       onClick={() => setActiveTab('dlq')} iconColor="var(--eds-danger-2)" />
              <NavItem icon={ShieldCheck}       label="Settings & Keys"        isActive={activeTab === 'settings' || activeTab === 'security'} onClick={() => setActiveTab('settings')} iconColor="var(--eds-accent-2)" />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. User Profile Footer ─────────────────────────────────── */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: '1px solid var(--eds-border)' }}
      >
        <div
          className="flex items-center justify-between gap-2 rounded-eds p-2.5"
          style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
        >
          {/* Avatar + user info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-eds text-xs font-bold font-mono"
              style={{ background: 'var(--eds-accent)', color: '#ffffff' }}
            >
              {userInitials}
            </div>
            <div className="min-w-0 truncate">
              <div className="text-xs font-bold truncate" style={{ color: 'var(--eds-text)' }}>
                {user?.email || 'Admin Operator'}
              </div>
              <div className="text-[10px] capitalize font-mono truncate" style={{ color: 'var(--eds-muted)' }}>
                {user?.role || 'Company Admin'}
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="shrink-0 rounded-eds p-1.5 transition-colors"
            style={{ color: 'var(--eds-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--eds-danger-dim)';
              e.currentTarget.style.color = 'var(--eds-danger-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--eds-muted)';
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

    </aside>
  );
}
