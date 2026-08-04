import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronRight,
  Search,
  Bell,
  Menu,
  CheckCircle2,
  Info,
  X
} from 'lucide-react';

export default function Navbar({ onMobileMenuToggle }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  // Close notification popover on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getPageTitle = () => {
    const p = location.pathname;
    if (p.includes('/dashboard/projects/') && p !== '/dashboard/projects') return 'Project Workspace';
    if (p.includes('/dashboard/projects') || p === '/projects') return 'Project Management';
    if (p.includes('/settings')) return 'Settings & Governance';
    if (p.includes('/logs') || p.includes('/activity')) return 'Live Logs Explorer';
    if (p.includes('/dlq') || p.includes('/tasks')) return 'Dead Letter Queue';
    if (p.includes('/simulate') || p.includes('/sandbox')) return 'Webhook Simulator';
    return 'Company Dashboard';
  };

  const pageTitle = getPageTitle();

  return (
    <header
      className="sticky top-0 z-20 w-full shrink-0 select-none"
      style={{
        borderBottom: '1px solid var(--eds-border)',
        background: 'rgba(9,11,18,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="flex h-14 w-full items-center justify-between px-5 gap-4">

        {/* ── Left: Mobile burger + Breadcrumb ──────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="md:hidden rounded-eds p-2 transition-colors"
            style={{ color: 'var(--eds-muted)' }}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs">
            <span
              className="hidden sm:inline font-medium transition-colors cursor-default"
              style={{ color: 'var(--eds-muted)' }}
            >
              EDS Engine
            </span>
            <ChevronRight
              size={13}
              className="hidden sm:inline shrink-0"
              style={{ color: 'var(--eds-faint)' }}
            />
            <span className="font-bold tracking-tight" style={{ color: 'var(--eds-text)' }}>
              {pageTitle}
            </span>
          </nav>
        </div>

        {/* ── Center: Global Search (md+) ───────────────────────────── */}
        <div className="hidden md:flex flex-1 max-w-xs mx-4">
          <div className="relative w-full">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 shrink-0"
              size={13}
              style={{ color: 'var(--eds-muted)' }}
            />
            <input
              type="text"
              placeholder="Search projects, events, logs…"
              className="w-full rounded-eds py-1.5 pl-8 pr-3 text-xs outline-none transition-all duration-150 font-mono"
              style={{
                background: 'var(--eds-surface-2)',
                border: '1px solid var(--eds-border-2)',
                color: 'var(--eds-text)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--eds-accent)';
                e.target.style.boxShadow = '0 0 0 1px var(--eds-accent-ring)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--eds-border-2)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
        </div>

        {/* ── Right: System Status + Notifications ──────────────────── */}
        <div className="flex items-center gap-2 shrink-0">

          {/* System Status Pill */}
          <div
            className="hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold font-mono"
            style={{
              background: 'var(--eds-success-dim)',
              border: '1px solid rgba(16,185,129,0.25)',
              color: 'var(--eds-success)',
            }}
          >
            <span className="eds-dot-success inline-flex h-1.5 w-1.5" />
            <CheckCircle2 size={11} />
            <span className="hidden lg:inline">Operational</span>
          </div>

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative rounded-eds p-2 transition-colors"
              style={{ color: 'var(--eds-muted)' }}
              aria-label="Notifications"
            >
              <Bell size={16} />
            </button>

            {/* Notification Popover */}
            {notifOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-72 rounded-eds-md shadow-eds-lg z-50 animate-pop-in"
                style={{
                  background: 'var(--eds-panel-2)',
                  border: '1px solid var(--eds-border-2)',
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: '1px solid var(--eds-border)' }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: 'var(--eds-text)' }}
                  >
                    Notifications
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="rounded p-0.5 transition-colors"
                    style={{ color: 'var(--eds-muted)' }}
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Empty state */}
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ background: 'var(--eds-elevated)' }}
                  >
                    <Info size={18} style={{ color: 'var(--eds-muted)' }} />
                  </div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--eds-text-2)' }}>
                    No new notifications
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--eds-muted)' }}>
                    Webhook alerts and system events will appear here.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
