import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Shield, Radio, Activity, Code2, Cpu } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-[#020617] text-zinc-900 dark:text-zinc-100 flex items-center justify-center font-sans antialiased">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-[0.15] pointer-events-none" />
      
      {/* Ambient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[140px] opacity-[0.08] bg-emerald-500 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[140px] opacity-[0.08] bg-indigo-500 pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0d1017] shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
          
          {/* Left Panel: Enterprise Info */}
          <div className="relative flex flex-col justify-between overflow-hidden bg-zinc-100/80 dark:bg-[#0a0c12] p-8 sm:p-12 lg:p-16 border-r border-zinc-200 dark:border-zinc-800/80">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.02),_transparent_40%)]" />
            
            {/* Top Tagline */}
            <div className="relative">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                EDS Core Console v2.0
              </div>
              
              <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-tight sm:text-5xl">
                Sign in to your production <span className="bg-gradient-to-r from-indigo-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent">webhook command center</span>.
              </h1>
              
              <p className="mt-6 max-w-lg text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 font-medium">
                Access your telemetry pipeline, inspect real-time response signatures, and control webhook propagation from a unified plane.
              </p>
            </div>

            {/* Middle Section: Info Cards */}
            <div className="relative mt-12 space-y-4">
              <div className="group flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0d1017] p-4 transition-all duration-300 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-500">
                  <Activity size={18} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100">Company-aware Sessions</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Automated workspace partitioning with zero configuration leaks.</div>
                </div>
              </div>

              <div className="group flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0d1017] p-4 transition-all duration-300 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                  <Code2 size={18} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100">FastAPI Gateway</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Secure, low-latency cookies keeping telemetry transport completely safe.</div>
                </div>
              </div>

              <div className="group flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0d1017] p-4 transition-all duration-300 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
                  <Cpu size={18} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100">Autonomous Ingestion</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Instantly trace packet payloads, routing, and delivery retry queues.</div>
                </div>
              </div>
            </div>

            {/* Bottom Brand Indicator */}
            <div className="relative mt-12 flex items-center gap-2.5 text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">
              <Shield size={12} className="text-emerald-500" />
              <span>AES-256 TLS Layer Configured</span>
            </div>
          </div>

          {/* Right Panel: Form */}
          <div className="flex flex-col justify-center bg-white dark:bg-[#0d1017] p-8 sm:p-12 lg:p-16">
            <div className="w-full max-w-md mx-auto">
              
              {/* Header Branding Panel */}
              <div className="flex items-center gap-4 mb-10">
                <div className="flex items-center justify-center p-2 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-inner">
                  <BrandLogo size={44} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Welcome Back</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Verify credentials to open bridge</p>
                </div>
              </div>

              {/* Form Element */}
              <form className="space-y-4" onSubmit={handleSubmit}>
                
                {/* Username Input Field */}
                <div className="space-y-1">
                  <label 
                    className="block font-mono text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
                    htmlFor="username"
                  >
                    Email or username
                  </label>
                  <input 
                    id="username" 
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono text-zinc-900 outline-none transition-all focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" 
                    value={form.username} 
                    onChange={updateField('username')} 
                    autoComplete="email" 
                    placeholder="name@company.com"
                  />
                </div>

                {/* Password Input Field */}
                <div className="space-y-1">
                  <label 
                    className="block font-mono text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <input 
                    id="password" 
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono text-zinc-900 outline-none transition-all focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" 
                    value={form.password} 
                    onChange={updateField('password')} 
                    type="password" 
                    autoComplete="current-password" 
                    placeholder="••••••••"
                  />
                </div>

                {/* Error Banner Container */}
                {error && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-500 flex items-start gap-2.5">
                    <span className="mt-0.5 text-sm">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Trigger Button */}
                <button 
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50 mt-2" 
                  type="submit" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin text-white" size={16} />
                      Authenticating Credentials...
                    </>
                  ) : (
                    <>
                      Verify & Access Console
                    </>
                  )}
                </button>
              </form>

              {/* Bottom Register Redirection */}
              <div className="mt-8 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
                New on the infrastructure?{' '}
                <Link className="font-bold text-indigo-600 dark:text-indigo-400 transition-colors hover:underline" to="/register">
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