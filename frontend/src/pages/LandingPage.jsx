import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Server, 
  RefreshCw, 
  Activity, 
  Lock, 
  AlertTriangle, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  Cpu, 
  FileCode2,
  Terminal,
  Database
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-zinc-50 dark:bg-[#020617] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-indigo-600 selection:text-white">
      
      {/* Background Radial Glow Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute top-1/2 right-0 h-[500px] w-[500px] rounded-full bg-emerald-600/10 blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full bg-cyan-600/10 blur-[150px]" />
      </div>

      {/* Top Floating Glass Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-[#0d1017]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size={36} />
            <div>
              <span className="text-base font-extrabold tracking-wider text-zinc-900 dark:text-white font-mono">EDS ENGINE</span>
              <span className="ml-2 text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-mono">v1.0 Enterprise</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link 
              to="/login"
              className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition px-3 py-2"
            >
              Sign In
            </Link>
            <Link 
              to={user ? "/dashboard" : "/register"}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white px-5 py-2.5 shadow-lg transition active:scale-95"
            >
              <span>{user ? 'Open Console' : 'Get Started'}</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* 🚀 1. HERO SECTION */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-20 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300 backdrop-blur-md mb-6 font-mono">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Enterprise Webhook Delivery & Observability Control Plane
        </div>

        <h1 className="max-w-4xl text-4xl sm:text-6xl font-black text-zinc-900 dark:text-white leading-tight tracking-tight">
          Enterprise Webhook Gateway with <span className="bg-gradient-to-r from-indigo-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent">Zero Data Loss</span> & HMAC Cryptography
        </h1>

        <p className="mt-6 max-w-2xl text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Decouple ingestion from delivery. High-throughput webhook gateway backed by RabbitMQ message queues, Celery worker pools, exponential backoff retries, and real-time SSE telemetry.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to={user ? "/dashboard" : "/register"}
            className="inline-flex items-center gap-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-7 py-3.5 text-xs font-bold text-white shadow-xl transition transform hover:-translate-y-0.5 active:scale-95"
          >
            <span>Launch Console</span>
            <ArrowRight size={18} />
          </Link>

          <a
            href="#problem-solution"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 dark:border-zinc-800 dark:bg-[#0d1017] dark:hover:bg-zinc-900 px-6 py-3.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition shadow-md"
          >
            <span>Architecture Overview</span>
          </a>
        </div>

        {/* Hero Badges */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-3xl">
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#0d1017] text-xs font-mono text-zinc-700 dark:text-zinc-300 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>HMAC-SHA256 & RSA-2048</span>
          </div>
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#0d1017] text-xs font-mono text-zinc-700 dark:text-zinc-300 shadow-sm">
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Sub-millisecond Ingress</span>
          </div>
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#0d1017] text-xs font-mono text-zinc-700 dark:text-zinc-300 shadow-sm">
            <RefreshCw className="h-4 w-4 text-indigo-500" />
            <span>RabbitMQ DLQ Replay</span>
          </div>
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#0d1017] text-xs font-mono text-zinc-700 dark:text-zinc-300 shadow-sm">
            <Layers className="h-4 w-4 text-cyan-500" />
            <span>Multi-Tenant Isolation</span>
          </div>
        </div>
      </section>

      {/* ⚖️ 2. PROBLEM VS. SOLUTION SECTION */}
      <section id="problem-solution" className="relative z-10 max-w-7xl mx-auto px-6 py-16 border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-indigo-500">BENCHMARK COMPARISON</h2>
          <h3 className="mt-2 text-3xl font-extrabold text-zinc-900 dark:text-white">Why Synchronous Webhooks Fail vs. EDS Engine</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Fragile Custom Receiver */}
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 space-y-6 backdrop-blur-md dark:bg-rose-950/10">
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-500">
                  <XCircle size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-extrabold text-zinc-900 dark:text-white">Fragile Sync Receivers</h4>
                  <p className="text-xs text-rose-600 dark:text-rose-300/80 font-medium">Direct tightly-coupled synchronous dispatch</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-full uppercase">High Risk</span>
            </div>

            <ul className="space-y-3.5 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2.5">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Silent Data Loss:</strong> Target timeouts or 5xx server errors immediately drop payloads.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>No Dead-Letter Buffer:</strong> Failed webhooks vanish without audit logs or replay capabilities.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Blocking Latency:</strong> Ingestion response waits for downstream HTTP calls to finish.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Unverified Signatures:</strong> Susceptible to forgery without cryptographic HMAC validation.</span>
              </li>
            </ul>
          </div>

          {/* EDS Engine Architecture */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 space-y-6 backdrop-blur-md dark:bg-emerald-950/10">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-500">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-extrabold text-zinc-900 dark:text-white">EDS Engine Webhook Gateway</h4>
                  <p className="text-xs text-emerald-600 dark:text-emerald-300/80 font-medium">Asynchronous decoupled queue architecture</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full uppercase">Production Grade</span>
            </div>

            <ul className="space-y-3.5 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Zero Data Loss Guarantees:</strong> Ingress persists to DB and pushes to RabbitMQ durable queue.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Automated Exponential Backoff:</strong> Celery retry loop with 5 attempts before routing to DLQ.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>1-Click DLQ Manual Replay:</strong> Purge and requeue dead-letter messages instantly.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Real-time Telemetry:</strong> Live SSE streaming logs & Redis Pub/Sub WebSocket metrics.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 📦 3. FEATURES GRID */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-indigo-500">CORE CAPABILITIES</h2>
          <h3 className="mt-2 text-3xl font-extrabold text-zinc-900 dark:text-white">Engineered for Enterprise Scale</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0d1017] p-6 space-y-4 shadow-xl hover:border-indigo-500/50 transition">
            <div className="p-3 w-fit rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Activity size={24} />
            </div>
            <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">Real-Time SSE & WS Telemetry</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Stream live webhook delivery events directly to your dashboard using Server-Sent Events (`/v1/logs/stream`) and Redis Pub/Sub WebSockets.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0d1017] p-6 space-y-4 shadow-xl hover:border-indigo-500/50 transition">
            <div className="p-3 w-fit rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <AlertTriangle size={24} />
            </div>
            <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">Dead-Letter Queue & Purge Replay</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Capture persistent delivery failures into RabbitMQ DLQ. Inspect full JSON payloads and trigger 1-click manual requeuing.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0d1017] p-6 space-y-4 shadow-xl hover:border-indigo-500/50 transition">
            <div className="p-3 w-fit rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Layers size={24} />
            </div>
            <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">Multi-Tenant Relational Isolation</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Strict relational scoping by `company_id` and `project_id`. API keys and HMAC secrets are cryptographically isolated per project.
            </p>
          </div>
        </div>
      </section>

      {/* 🏁 4. CALL TO ACTION (CTA) */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-16 my-12 text-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0d1017] p-12 shadow-2xl backdrop-blur-xl">
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white">Ready to Deploy Your Gateway Control Plane?</h2>
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto">
          Start dispatching signed webhooks with sub-millisecond ingestion and complete real-time delivery observability.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            to={user ? "/dashboard" : "/register"}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-8 py-3.5 text-xs font-bold text-white shadow-xl transition active:scale-95"
          >
            <span>{user ? 'Go to Dashboard' : 'Create Free Account'}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0a0c12] py-8 text-center text-xs text-zinc-500 dark:text-zinc-400 font-mono">
        EDS Engine • Enterprise Webhook Gateway Platform • All rights reserved.
      </footer>

    </div>
  );
}
