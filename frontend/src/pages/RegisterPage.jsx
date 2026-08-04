import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

/* ─── Password Strength Indicator ─────────────────────────────────── */
function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', 'var(--eds-danger)', 'var(--eds-warning)', 'var(--eds-info)', 'var(--eds-success)'];

  return (
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= strength ? colors[strength] : 'var(--eds-border-2)' }}
          />
        ))}
      </div>
      {strength > 0 && (
        <span className="text-[10px] font-bold font-mono" style={{ color: colors[strength] }}>
          {labels[strength]} password
        </span>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setError('Please enter a company name, a valid email, and a password with at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      setSuccess('Account created. Redirecting to sign in…');
      setTimeout(() => navigate('/login'), 900);
    } catch (err) {
      setError(err.message || 'Registration failed');
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
      <div className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full blur-[160px] pointer-events-none"
           style={{ background: 'rgba(99,102,241,0.08)' }} />
      <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full blur-[160px] pointer-events-none"
           style={{ background: 'rgba(16,185,129,0.06)' }} />

      {/* Main card */}
      <div
        className="relative z-10 w-full max-w-5xl mx-4 overflow-hidden rounded-eds-xl shadow-eds-xl animate-fade-up"
        style={{
          background: 'var(--eds-surface)',
          border: '1px solid var(--eds-border-2)',
        }}
      >
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">

          {/* ── Left info panel ──────────────────────────────────── */}
          <div
            className="relative flex flex-col justify-between overflow-hidden p-10 lg:p-14"
            style={{
              background: 'var(--eds-panel)',
              borderRight: '1px solid var(--eds-border)',
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, transparent 60%)' }}
            />

            <div className="relative">
              <div
                className="inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs font-bold font-mono"
                style={{
                  background: 'var(--eds-accent-dim)',
                  border: '1px solid var(--eds-accent-ring)',
                  color: 'var(--eds-accent-2)',
                }}
              >
                <span className="h-2 w-2 rounded-full animate-pulse"
                      style={{ background: 'var(--eds-accent-2)' }} />
                New Workspace
              </div>

              <h1 className="mt-8 text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight"
                  style={{ color: 'var(--eds-text)' }}>
                Create your secure command center for webhook operations.
              </h1>

              <p className="mt-5 max-w-sm text-xs leading-relaxed" style={{ color: 'var(--eds-muted)' }}>
                Set up your account and step into a premium, production-grade experience backed by
                real backend services.
              </p>

              {/* Feature checklist */}
              <ul className="mt-10 space-y-3">
                {[
                  'Dedicated API key &amp; HMAC secret per project',
                  'Real-time WebSocket telemetry dashboard',
                  'Dead Letter Queue with on-demand replay',
                  'Multi-project isolation &amp; team governance',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-xs" style={{ color: 'var(--eds-muted)' }}>
                    <ShieldCheck size={13} className="shrink-0 mt-0.5"
                                  style={{ color: 'var(--eds-success)' }} />
                    <span dangerouslySetInnerHTML={{ __html: item }} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-10 text-[10px] font-mono font-extrabold uppercase tracking-widest"
                 style={{ color: 'var(--eds-faint)' }}>
              EDS ENGINE • PRODUCTION GATEWAY V2.0
            </div>
          </div>

          {/* ── Right form panel ───────────────────────────────── */}
          <div
            className="flex items-center justify-center p-10 lg:p-14"
            style={{ background: 'var(--eds-panel-2)' }}
          >
            <div className="w-full max-w-sm">

              {/* Brand header */}
              <div className="flex items-center gap-3 mb-8">
                <div
                  className="flex items-center justify-center p-2 rounded-eds"
                  style={{
                    background: 'var(--eds-surface)',
                    border: '1px solid var(--eds-border-2)',
                  }}
                >
                  <BrandLogo size={38} />
                </div>
                <div>
                  <div className="text-lg font-extrabold" style={{ color: 'var(--eds-text)' }}>
                    Create Account
                  </div>
                  <div className="text-xs" style={{ color: 'var(--eds-muted)' }}>
                    Set up your workspace
                  </div>
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>

                <div className="space-y-1.5">
                  <label className="eds-label" htmlFor="name">Company Name *</label>
                  <input
                    id="name"
                    className="eds-input"
                    value={form.name}
                    onChange={updateField('name')}
                    autoComplete="organization"
                    placeholder="e.g. Dameer Corp"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="eds-label" htmlFor="email">Email Address *</label>
                  <input
                    id="email"
                    className="eds-input"
                    value={form.email}
                    onChange={updateField('email')}
                    autoComplete="email"
                    placeholder="admin@company.com"
                    type="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="eds-label" htmlFor="password">Password *</label>
                  <div className="relative">
                    <input
                      id="password"
                      className="eds-input pr-10"
                      value={form.password}
                      onChange={updateField('password')}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min. 6 characters"
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
                  <PasswordStrength password={form.password} />
                </div>

                {error && (
                  <div
                    className="rounded-eds px-4 py-3 text-xs font-semibold"
                    style={{
                      background: 'var(--eds-danger-dim)',
                      border: '1px solid rgba(244,63,94,0.25)',
                      color: 'var(--eds-danger-2)',
                    }}
                  >
                    {error}
                  </div>
                )}
                {success && (
                  <div
                    className="rounded-eds px-4 py-3 text-xs font-semibold"
                    style={{
                      background: 'var(--eds-success-dim)',
                      border: '1px solid rgba(16,185,129,0.25)',
                      color: 'var(--eds-success)',
                    }}
                  >
                    {success}
                  </div>
                )}

                <button
                  className="eds-btn-primary w-full mt-2"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={15} />
                      Creating account…
                    </>
                  ) : (
                    'Create Workspace Account'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center text-xs" style={{ color: 'var(--eds-muted)' }}>
                Already registered?{' '}
                <Link
                  className="font-bold hover:underline transition-colors"
                  style={{ color: 'var(--eds-accent-2)' }}
                  to="/login"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
