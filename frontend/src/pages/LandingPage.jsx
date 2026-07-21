import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenText } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

const featureRows = [
  'Real-time gateway telemetry with clear delivery reasoning',
  'Secure project onboarding with masked credential handling',
  'Developer-grade log inspection for every webhook event',
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <div className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.16),_transparent_24%)]" />
        <div className="relative w-full max-w-7xl overflow-hidden rounded-[32px] border border-zinc-800/80 bg-zinc-950/85 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-8 sm:p-10 lg:p-14">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                WEDS • Reliable routing engine
              </div>
              <div className="mt-6 flex items-center gap-3">
                <BrandLogo size={44} />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">Webhook Event Delivery System</div>
                  <div className="text-lg font-semibold text-zinc-100">Low-latency, high-trust delivery</div>
                </div>
              </div>
              <h1 className="mt-8 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Reliable, Low-Latency Webhook Routing Engine.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
                From ingestion to delivery inspection, WEDS gives product and platform teams a production-grade control plane grounded in the real FastAPI backend data model.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-emerald-400" to={user ? '/dashboard' : '/login'}>
                  Launch Console
                  <ArrowRight size={16} />
                </Link>
                <a className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 font-semibold text-zinc-100 transition hover:bg-zinc-800" href="https://fastapi.tiangolo.com/" target="_blank" rel="noreferrer">
                  <BookOpenText size={16} />
                  Documentation
                </a>
              </div>
              <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                {featureRows.map((item) => (
                  <li key={item} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-300">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-zinc-800/80 bg-zinc-900/70 p-8 sm:p-10 lg:border-l lg:border-t-0">
              <div className="rounded-[28px] border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">Live traffic</div>
                    <div className="mt-1 text-xl font-semibold text-zinc-100">Packet path preview</div>
                  </div>
                  <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300">99.98% stable</div>
                </div>

                <svg viewBox="0 0 320 220" className="mt-6 h-56 w-full" role="img" aria-label="Packet flow visual">
                  <rect x="18" y="20" width="284" height="180" rx="24" fill="#0f172a" stroke="#1f2937" />
                  <path d="M72 112C104 76 146 58 188 78C214 90 232 118 252 136" stroke="#10b981" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M67 112L88 96L78 124" fill="#10b981" />
                  <path d="M252 136L232 152L242 126" fill="#6366f1" />
                  <circle cx="110" cy="94" r="8" fill="#34d399" />
                  <circle cx="188" cy="78" r="8" fill="#38bdf8" />
                  <circle cx="252" cy="136" r="8" fill="#818cf8" />
                  <path d="M100 146H240" stroke="#1f2937" strokeWidth="2" strokeDasharray="6 6" />
                  <rect x="92" y="126" width="48" height="42" rx="12" fill="#111827" stroke="#2dd4bf" />
                  <rect x="220" y="120" width="48" height="42" rx="12" fill="#111827" stroke="#818cf8" />
                  <circle cx="152" cy="158" r="6" fill="#fbbf24" />
                </svg>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="text-xs uppercase tracking-[0.28em] text-zinc-500">Source ingress</div>
                    <div className="mt-2 font-mono text-sm text-zinc-200">POST /v1/gateway</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="text-xs uppercase tracking-[0.28em] text-zinc-500">Targets</div>
                    <div className="mt-2 font-mono text-sm text-zinc-200">3 active endpoints</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
