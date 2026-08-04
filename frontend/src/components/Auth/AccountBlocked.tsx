import React from 'react';
import { ShieldAlert, RefreshCw, LogOut, Lock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

const AccountBlocked: React.FC = () => {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 font-display"
      style={{ background: 'var(--eds-bg)', color: 'var(--eds-text)' }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(244,63,94,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-eds-xl p-8 animate-fade-up"
        style={{
          background: 'var(--eds-panel)',
          border: '1px solid var(--eds-border-2)',
          boxShadow: '0 32px 90px rgba(0,0,0,0.8)',
        }}
      >

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{
              background: 'var(--eds-danger-dim)',
              border: '1px solid rgba(244,63,94,0.25)',
            }}
          >
            <Lock
              size={32}
              style={{ color: 'var(--eds-danger-2)' }}
              className="animate-pulse"
            />
          </div>
        </div>

        {/* Heading */}
        <h1
          className="text-2xl font-bold text-center mb-2"
          style={{ color: 'var(--eds-danger-2)' }}
        >
          Account Blocked
        </h1>

        {/* Subtext */}
        <p className="text-center text-xs mb-6" style={{ color: 'var(--eds-muted)' }}>
          Your account has been locked for 24 hours due to suspicious activity.
        </p>

        {/* Details panel */}
        <div
          className="rounded-eds p-4 mb-6 space-y-2"
          style={{
            background: 'var(--eds-danger-dim)',
            borderLeft: '3px solid var(--eds-danger)',
          }}
        >
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--eds-text-2)' }}>
            <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--eds-danger-2)' }} />
            <span>
              <strong>Reason:</strong> Your refresh token was reused, indicating a potential security breach.
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--eds-text-2)' }}>
            <ShieldAlert size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--eds-warning)' }} />
            <span>
              <strong>Action:</strong> For your security, please try logging in after 24 hours.
            </span>
          </div>
        </div>

        {/* Security tips */}
        <div
          className="rounded-eds p-4 mb-6"
          style={{
            background: 'var(--eds-surface-2)',
            border: '1px solid var(--eds-border)',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest font-mono mb-3"
             style={{ color: 'var(--eds-muted)' }}>
            Security Tips
          </p>
          <ul className="space-y-2 text-xs" style={{ color: 'var(--eds-text-2)' }}>
            {[
              'Change your password after regaining access',
              'Enable two-factor authentication (2FA)',
              'Review active sessions and revoke unauthorized ones',
              'Contact support if you believe this is an error',
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span style={{ color: 'var(--eds-accent-2)' }} className="mt-0.5 shrink-0">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <Link
            to="/login"
            className="eds-btn-primary w-full flex items-center justify-center gap-2"
          >
            <LogOut size={14} />
            Back to Sign In
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px]" style={{ color: 'var(--eds-faint)' }}>
          Your account will automatically unlock in 24 hours.
        </p>
      </div>
    </div>
  );
};

export default AccountBlocked;
