import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Shield, Activity, Code2, Cpu, Eye, EyeOff } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.username.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await login(form.username.trim(), form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field) => (event) => {
    setForm((c) => ({ ...c, [field]: event.target.value }));
  };

  return (
    <div
      className="relative min-h-screen w-screen overflow-hidden flex items-center justify-center font-display antialiased"
      style={{ background: 'var(--eds-bg)', color: 'var(--eds-text)' }}
    >
      {/* Ambient orbs */}
      <div className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full blur-[160px] pointer-events-none"
           style={{ background: 'rgba(99,102,241,0.08)' }} />
      <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full blur-[160px] pointer-events-none"
           style={{ background: 'rgba(16,185,129,0.07)' }} />

      {/* Main card */}
      <div
        className="relative z-10 w-full max-w-5xl mx-4 overflow-hidden rounded-eds-xl shadow-eds-xl animate-fade-up"
        style={{
          background: 'var(--eds-surface)',
          border: '1px solid var(--eds-border-2)',
        }}
      >
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">

          {/* ── Left info panel ────────────────────────────────────── */}
          <div
            className="relative flex flex-col justify-between overflow-hidden p-10 lg:p-14"
            style={{
              background: 'var(--eds-panel)',
              borderRight: '1px solid var(--eds-border)',
            }}
          >
            {/* Subtle top gradient overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, transparent 60%)' }}
            />

            <div className="relative">
              {/* Live badge */}
              <div
                className="inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs font-bold font-mono"
                style={{
                  background: 'var(--eds-success-dim)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  color: 'var(--eds-success)',
                }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ background: 'var(--eds-success)' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2"
                        style={{ background: 'var(--eds-success)' }} />
                </span>
                EDS Core Console v2.0
              </div>

              <h1 className="mt-8 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight"
                  style={{ color: 'var(--eds-text)' }}>
                Sign in to your production{' '}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(135deg, #818cf8, #6366f1 40%, #34d399)' }}
                >
                  webhook command center
                </span>
                .
              </h1>

              <p className="mt-5 max-w-sm text-xs leading-relaxed" style={{ color: 'var(--eds-muted)' }}>
                Access your telemetry pipeline, inspect real-time response signatures, and control
                webhook propagation from a unified plane.
              </p>
            </div>

            {/* Info cards */}
            <div className="relative mt-10 space-y-3">
              {[
                {
                  icon: Activity,
                  color: 'var(--eds-accent-2)',
                  bg: 'var(--eds-accent-dim)',
                  title: 'Company-aware Sessions',
                  desc: 'Automated workspace partitioning with zero configuration leaks.',
                },
                {
                  icon: Code2,
                  color: 'var(--eds-success)',
                  bg: 'var(--eds-success-dim)',
                  title: 'FastAPI Gateway',
                  desc: 'Secure, low-latency transport keeping telemetry completely safe.',
                },
                {
                  icon: Cpu,
                  color: 'var(--eds-info)',
                  bg: 'var(--eds-info-dim)',
                  title: 'Autonomous Ingestion',
                  desc: 'Trace packet payloads, routing, and delivery retry queues in real time.',
                },
              ].map(({ icon: Icon, color, bg, title, desc }) => (
                <div
                  key={title}
                  className="flex items-center gap-4 rounded-eds p-4"
                  style={{
                    background: 'var(--eds-surface)',
                    border: '1px solid var(--eds-border)',
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-eds"
                    style={{ background: bg, border: `1px solid ${color}30` }}
                  >
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold" style={{ color: 'var(--eds-text)' }}>{title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--eds-muted)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom security label */}
            <div className="relative mt-10 flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest"
                 style={{ color: 'var(--eds-faint)' }}>
              <Shield size={11} style={{ color: 'var(--eds-success)' }} />
              <span>AES-256 TLS Layer Configured</span>
            </div>
          </div>

          {/* ── Right form panel ─────────────────────────────────────── */}
          <div
            className="flex flex-col justify-center p-10 lg:p-14"
            style={{ background: 'var(--eds-panel-2)' }}
          >
            <div className="w-full max-w-sm mx-auto">

              {/* Brand header */}
              <div className="flex items-center gap-4 mb-10">
                <div
                  className="flex items-center justify-center p-2 rounded-eds"
                  style={{
                    background: 'var(--eds-surface)',
                    border: '1px solid var(--eds-border-2)',
                  }}
                >
                  <BrandLogo size={40} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
                    Welcome Back
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--eds-muted)' }}>
                    Verify credentials to open bridge
                  </p>
                </div>
              </div>

              {/* Form */}
              <form className="space-y-4" onSubmit={handleSubmit}>

                {/* Username */}
                <div className="space-y-1.5">
                  <label className="eds-label" htmlFor="username">
                    Email or Username
                  </label>
                  <input
                    id="username"
                    className="eds-input"
                    value={form.username}
                    onChange={updateField('username')}
                    autoComplete="email"
                    placeholder="name@company.com"
                    type="email"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="eds-label" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      className="eds-input pr-10"
                      value={form.password}
                      onChange={updateField('password')}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'var(--eds-muted)' }}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Error banner */}
                {error && (
                  <div
                    className="rounded-eds px-4 py-3 text-xs font-semibold flex items-start gap-2.5"
                    style={{
                      background: 'var(--eds-danger-dim)',
                      border: '1px solid rgba(244,63,94,0.25)',
                      color: 'var(--eds-danger-2)',
                    }}
                  >
                    <span className="mt-0.5 text-sm">⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  className="eds-btn-primary w-full mt-2"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={15} />
                      Authenticating…
                    </>
                  ) : (
                    'Verify & Access Console'
                  )}
                </button>
              </form>

              {/* Register link */}
              <div className="mt-8 text-center text-xs" style={{ color: 'var(--eds-muted)' }}>
                New on the infrastructure?{' '}
                <Link
                  className="font-bold transition-colors hover:underline"
                  style={{ color: 'var(--eds-accent-2)' }}
                  to="/register"
                >
                  Create a node account
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}