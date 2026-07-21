import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
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
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="min-h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-zinc-800/80 bg-zinc-950/85 shadow-[0_30px_120px_rgba(0,0,0,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(135deg,_#111827_0%,_#020617_100%)] p-8 sm:p-10 lg:p-12">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.08),_transparent_36%,_transparent_64%,_rgba(255,255,255,0.05))]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                New workspace
              </div>
              <h1 className="mt-6 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Create your secure command center for webhook operations.
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-400">
                Set up your account and step into a premium, production-grade experience backed by the real backend services.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center bg-zinc-950/70 p-8 sm:p-10 lg:p-12">
            <div className="w-full max-w-md rounded-[28px] border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <BrandLogo size={44} />
                <div>
                  <div className="text-lg font-semibold text-zinc-100">Create account</div>
                  <div className="text-sm text-zinc-400">Set up your workspace</div>
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="relative">
                  <label className={`pointer-events-none absolute left-4 transition-all ${form.name ? 'top-2 text-[11px] text-emerald-400' : 'top-1/2 -translate-y-1/2 text-sm text-zinc-500'}`} htmlFor="name">
                    Company name
                  </label>
                  <input id="name" className="h-14 w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 pt-5 pb-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.name} onChange={updateField('name')} autoComplete="organization" />
                </div>
                <div className="relative">
                  <label className={`pointer-events-none absolute left-4 transition-all ${form.email ? 'top-2 text-[11px] text-emerald-400' : 'top-1/2 -translate-y-1/2 text-sm text-zinc-500'}`} htmlFor="email">
                    Email address
                  </label>
                  <input id="email" className="h-14 w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 pt-5 pb-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.email} onChange={updateField('email')} autoComplete="email" />
                </div>
                <div className="relative">
                  <label className={`pointer-events-none absolute left-4 transition-all ${form.password ? 'top-2 text-[11px] text-emerald-400' : 'top-1/2 -translate-y-1/2 text-sm text-zinc-500'}`} htmlFor="password">
                    Password
                  </label>
                  <input id="password" className="h-14 w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 pt-5 pb-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.password} onChange={updateField('password')} type="password" autoComplete="new-password" />
                </div>

                {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-300">{error}</div> : null}
                {success ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">{success}</div> : null}

                <button className="btn btn-primary w-full" type="submit" disabled={loading}>
                  {loading ? <><Loader2 className="animate-spin" size={16} />Creating account…</> : 'Create account'}
                </button>
              </form>

              <div className="mt-5 text-center text-sm text-zinc-400">
                Already registered? <Link className="font-semibold text-emerald-300" to="/login">Sign in</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
