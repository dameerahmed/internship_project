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
    <div className="min-h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-[#020617] text-zinc-900 dark:text-zinc-100 flex items-center justify-center font-sans antialiased">
      <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8 w-full">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0d1017] shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative overflow-hidden bg-zinc-100/80 dark:bg-[#0a0c12] p-8 sm:p-10 lg:p-12 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col justify-between">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.08),_transparent_36%,_transparent_64%,_rgba(255,255,255,0.05))]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                New workspace
              </div>
              <h1 className="mt-6 text-3xl font-extrabold leading-tight text-zinc-900 dark:text-white sm:text-4xl">
                Create your secure command center for webhook operations.
              </h1>
              <p className="mt-4 max-w-xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 font-medium">
                Set up your account and step into a premium, production-grade experience backed by real backend services.
              </p>
            </div>

            <div className="relative mt-8 text-[10px] font-mono text-zinc-400 font-extrabold uppercase tracking-widest">
              EDS ENGINE • PRODUCTION GATEWAY V2.0
            </div>
          </div>

          <div className="flex items-center justify-center bg-white dark:bg-[#0d1017] p-8 sm:p-10 lg:p-12">
            <div className="w-full max-w-md">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center p-2 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-inner">
                  <BrandLogo size={40} />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-zinc-900 dark:text-white">Create Account</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Set up your workspace</div>
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <label className="block font-mono text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400" htmlFor="name">
                    Company name *
                  </label>
                  <input id="name" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" value={form.name} onChange={updateField('name')} autoComplete="organization" placeholder="e.g. Dameer Corp" />
                </div>
                
                <div className="space-y-1">
                  <label className="block font-mono text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400" htmlFor="email">
                    Email address *
                  </label>
                  <input id="email" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" value={form.email} onChange={updateField('email')} autoComplete="email" placeholder="admin@company.com" />
                </div>

                <div className="space-y-1">
                  <label className="block font-mono text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400" htmlFor="password">
                    Password *
                  </label>
                  <input id="password" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" value={form.password} onChange={updateField('password')} type="password" autoComplete="new-password" placeholder="••••••••" />
                </div>

                {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-500">{error}</div> : null}
                {success ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-500">{success}</div> : null}

                <button className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50 mt-2" type="submit" disabled={loading}>
                  {loading ? <><Loader2 className="animate-spin text-white" size={16} />Creating account…</> : 'Create Workspace Account'}
                </button>
              </form>

              <div className="mt-6 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Already registered? <Link className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline" to="/login">Sign in</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
