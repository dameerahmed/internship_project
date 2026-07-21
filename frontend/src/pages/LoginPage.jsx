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
    <div className="relative min-h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 flex items-center justify-center font-sans antialiased">
      {/* Premium Background Mesh Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-[0.15] pointer-events-none" />
      
      {/* Ambient Cosmic Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[140px] opacity-[0.08] bg-emerald-500 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[140px] opacity-[0.08] bg-indigo-500 pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-xl shadow-[0_0_80px_-15px_rgba(0,0,0,0.8)] lg:grid-cols-[1.1fr_0.9fr]">
          
          {/* Left Panel: Enterprise Aesthetics & Live Simulation */}
          <div className="relative flex flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_40%),linear-gradient(135deg,_#09090b_0%,_#111115_100%)] p-8 sm:p-12 lg:p-16 border-r border-zinc-800/50">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.02),_transparent_40%)]" />
            
            {/* Top Tagline */}
            <div className="relative">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/10 bg-emerald-500/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                WEDS Core Console v2.0
              </div>
              
              <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white leading-tight sm:text-5xl">
                Sign in to your production <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent">webhook command center</span>.
              </h1>
              
              <p className="mt-6 max-w-lg text-base leading-relaxed text-zinc-400">
                Access your telemetry pipeline, inspect real-time response signatures, and control webhook propagation from a unified plane.
              </p>
            </div>

            {/* Middle Section: Premium Interactive-looking Info Cards */}
            <div className="relative mt-12 space-y-4">
              <div className="group flex items-center gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4 transition-all duration-300 hover:bg-zinc-900/50 hover:border-zinc-700/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-950/80 text-emerald-400 transition-colors group-hover:text-emerald-300">
                  <Activity size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-200">Company-aware Sessions</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Automated workspace partitioning with zero configuration leaks.</div>
                </div>
              </div>

              <div className="group flex items-center gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4 transition-all duration-300 hover:bg-zinc-900/50 hover:border-zinc-700/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-950/80 text-emerald-400 transition-colors group-hover:text-emerald-300">
                  <Code2 size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-200">FastAPI Gateway</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Secure, low-latency cookies keeping telemetry transport completely safe.</div>
                </div>
              </div>

              <div className="group flex items-center gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4 transition-all duration-300 hover:bg-zinc-900/50 hover:border-zinc-700/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-950/80 text-emerald-400 transition-colors group-hover:text-emerald-300">
                  <Cpu size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-200">Autonomous Ingestion</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Instantly trace packet payloads, routing, and delivery retry queues.</div>
                </div>
              </div>
            </div>

            {/* Bottom Brand Indicator */}
            <div className="relative mt-12 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-600">
              <Shield size={12} className="text-emerald-500/80" />
              <span>AES-256 TLS Layer Configured</span>
            </div>
          </div>

          {/* Right Panel: Clean Premium Login Form */}
          <div className="flex flex-col justify-center bg-zinc-950/20 p-8 sm:p-12 lg:p-16">
            <div className="w-full max-w-md mx-auto">
              
              {/* Header Branding Panel */}
              <div className="flex items-center gap-4 mb-10">
                <div className="flex items-center justify-center p-1.5 rounded-2xl bg-zinc-900/80 border border-zinc-850 shadow-inner">
                  <BrandLogo size={48} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-100">Welcome Back</h2>
                  <p className="text-sm text-zinc-500 font-medium">Verify credentials to open bridge</p>
                </div>
              </div>

              {/* Form Element */}
              <form className="space-y-4" onSubmit={handleSubmit}>
                
                {/* Username Input Field */}
                <div className="group relative">
                  <label 
                    className={`pointer-events-none absolute left-4 transition-all duration-300 select-none ${
                      form.username 
                        ? 'top-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider' 
                        : 'top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-500 group-focus-within:top-2 group-focus-within:text-[10px] group-focus-within:font-bold group-focus-within:text-emerald-400 group-focus-within:uppercase'
                    }`} 
                    htmlFor="username"
                  >
                    Email or username
                  </label>
                  <input 
                    id="username" 
                    className="h-14 w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 pt-5 pb-2 text-sm font-medium text-zinc-100 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 focus:bg-zinc-950" 
                    value={form.username} 
                    onChange={updateField('username')} 
                    autoComplete="email" 
                  />
                </div>

                {/* Password Input Field */}
                <div className="group relative">
                  <label 
                    className={`pointer-events-none absolute left-4 transition-all duration-300 select-none ${
                      form.password 
                        ? 'top-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider' 
                        : 'top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-500 group-focus-within:top-2 group-focus-within:text-[10px] group-focus-within:font-bold group-focus-within:text-emerald-400 group-focus-within:uppercase'
                    }`} 
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <input 
                    id="password" 
                    className="h-14 w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 pt-5 pb-2 text-sm font-medium text-zinc-100 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 focus:bg-zinc-950" 
                    value={form.password} 
                    onChange={updateField('password')} 
                    type="password" 
                    autoComplete="current-password" 
                  />
                </div>

                {/* Error Banner Container */}
                {error && (
                  <div className="rounded-2xl border border-rose-500/10 bg-rose-500/5 px-4 py-3 text-xs font-semibold text-rose-400 leading-relaxed flex items-start gap-2.5">
                    <span className="mt-0.5 text-sm">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Trigger Button */}
                <button 
                  className="group relative inline-flex w-full h-13 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold text-sm tracking-wide text-zinc-950 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50" 
                  type="submit" 
                  disabled={loading}
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin text-zinc-950" size={16} />
                      Authenticating Server Key...
                    </>
                  ) : (
                    <>
                      Verify & Access Console
                    </>
                  )}
                </button>
              </form>

              {/* Bottom Register Redirection */}
              <div className="mt-8 text-center text-xs font-medium text-zinc-400">
                New on the infrastructure?{' '}
                <Link className="font-bold text-emerald-400 transition-colors hover:text-emerald-300" to="/register">
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