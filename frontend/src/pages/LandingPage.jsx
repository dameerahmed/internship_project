import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  RefreshCw,
  Activity,
  Lock,
  Layers,
  CheckCircle2,
  XCircle,
  Server,
  Database,
  Cpu,
  BarChart3,
  KeyRound,
  Globe,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

/* ─── Animated Counter Hook ──────────────────────────────────────────── */
function useCounter(target, duration = 1600, started = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started) return;
    let startTime = null;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, started]);
  return value;
}

/* ─── Hero Stats ─────────────────────────────────────────────────────── */
function HeroStat({ label, value, suffix = '', started }) {
  const count = useCounter(value, 1800, started);
  return (
    <div className="text-center">
      <div className="text-3xl font-black tracking-tight" style={{ color: 'var(--eds-text)' }}>
        {count.toLocaleString()}{suffix}
      </div>
      <div className="mt-1 text-[11px] font-semibold font-mono uppercase tracking-wider"
           style={{ color: 'var(--eds-muted)' }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Feature Card ───────────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, desc, iconBg, iconColor }) {
  return (
    <div
      className="group rounded-eds-md p-6 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--eds-panel)',
        border: '1px solid var(--eds-border)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--eds-border-2)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--eds-border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-eds-md"
        style={{ background: iconBg, border: `1px solid ${iconColor}30` }}
      >
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--eds-text)' }}>{title}</h3>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--eds-muted)' }}>{desc}</p>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [statsStarted, setStatsStarted] = useState(false);

  useEffect(() => {
    // Trigger counter animation after a brief delay
    const t = setTimeout(() => setStatsStarted(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen w-screen overflow-x-hidden font-display"
      style={{ background: 'var(--eds-bg)', color: 'var(--eds-text)' }}
    >

      {/* ── Background ambient orbs ─────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full blur-[160px]"
             style={{ background: 'rgba(99,102,241,0.07)' }} />
        <div className="absolute top-1/3 right-0 h-[500px] w-[500px] rounded-full blur-[180px]"
             style={{ background: 'rgba(16,185,129,0.06)' }} />
        <div className="absolute bottom-0 left-1/4 h-[600px] w-[600px] rounded-full blur-[160px]"
             style={{ background: 'rgba(99,102,241,0.05)' }} />
      </div>

      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-50 backdrop-blur-eds"
        style={{
          borderBottom: '1px solid var(--eds-border)',
          background: 'rgba(6,8,13,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size={34} />
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-wider font-mono"
                    style={{ color: 'var(--eds-text)' }}>
                EDS ENGINE
              </span>
              <span
                className="text-[9px] font-bold font-mono uppercase px-2 py-0.5 rounded"
                style={{
                  background: 'var(--eds-accent-dim)',
                  border: '1px solid var(--eds-accent-ring)',
                  color: 'var(--eds-accent-2)',
                }}
              >
                v2.0 Enterprise
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-xs font-semibold transition-colors px-3 py-2"
              style={{ color: 'var(--eds-muted)' }}
            >
              Sign In
            </Link>
            <Link
              to={user ? '/dashboard' : '/register'}
              className="inline-flex items-center gap-2 rounded-eds text-xs font-bold text-white px-5 py-2.5 shadow-eds-glow-indigo transition-all duration-150 active:scale-95"
              style={{ background: 'var(--eds-accent)', border: '1px solid var(--eds-accent-ring)' }}
            >
              <span>{user ? 'Open Console' : 'Get Started'}</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-20 text-center flex flex-col items-center">

        {/* Status pill */}
        <div
          className="inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs font-bold font-mono mb-8"
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
          Enterprise Webhook Delivery &amp; Observability Control Plane
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-4xl sm:text-6xl font-black leading-tight tracking-tight"
            style={{ color: 'var(--eds-text)' }}>
          Enterprise Webhook Gateway with{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg, #818cf8 0%, #6366f1 40%, #34d399 100%)' }}
          >
            Zero Data Loss
          </span>
          {' '}&amp; HMAC Cryptography
        </h1>

        {/* Sub-headline */}
        <p
          className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed"
          style={{ color: 'var(--eds-muted)' }}
        >
          Decouple ingestion from delivery. High-throughput webhook gateway backed by RabbitMQ
          message queues, Celery worker pools, exponential backoff retries, and real-time telemetry.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to={user ? '/dashboard' : '/register'}
            className="inline-flex items-center gap-2.5 rounded-eds text-sm font-bold text-white px-8 py-3.5 shadow-eds-glow-indigo transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
            style={{ background: 'var(--eds-accent)', border: '1px solid var(--eds-accent-ring)' }}
          >
            <span>Launch Console</span>
            <ArrowRight size={18} />
          </Link>

          <a
            href="#architecture"
            className="inline-flex items-center gap-2 rounded-eds text-xs font-bold transition-all duration-150 px-7 py-3.5"
            style={{
              background: 'var(--eds-panel)',
              border: '1px solid var(--eds-border-2)',
              color: 'var(--eds-text-2)',
            }}
          >
            Architecture Overview
          </a>
        </div>

        {/* Hero trust badges */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl">
          {[
            { icon: ShieldCheck, label: 'HMAC SHA-256', color: 'var(--eds-success)' },
            { icon: Zap,         label: 'Sub-ms Ingress', color: 'var(--eds-accent-2)' },
            { icon: RefreshCw,   label: 'Smart DLQ Replay', color: 'var(--eds-warning)' },
            { icon: Activity,    label: 'Live Telemetry', color: 'var(--eds-info)' },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-2 rounded-eds p-3 text-xs font-mono font-semibold"
              style={{
                background: 'var(--eds-panel)',
                border: '1px solid var(--eds-border)',
                color: 'var(--eds-text-2)',
              }}
            >
              <Icon size={14} style={{ color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Hero Stats */}
        <div
          className="mt-16 w-full max-w-3xl rounded-eds-lg p-8 grid grid-cols-2 sm:grid-cols-4 gap-6"
          style={{
            background: 'var(--eds-panel)',
            border: '1px solid var(--eds-border-2)',
          }}
        >
          <HeroStat label="Webhooks / Day"       value={2400000} suffix="+"  started={statsStarted} />
          <HeroStat label="Avg Latency"           value={12}      suffix="ms" started={statsStarted} />
          <HeroStat label="DLQ Recovery Rate"     value={99}      suffix="%"  started={statsStarted} />
          <HeroStat label="Uptime SLA"            value={99}      suffix=".9%" started={statsStarted} />
        </div>
      </section>

      {/* ══ ARCHITECTURE SECTION ════════════════════════════════════════ */}
      <section
        id="architecture"
        className="relative z-10 py-24"
        style={{ borderTop: '1px solid var(--eds-border)', background: 'var(--eds-surface)' }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-16">
            <div className="text-[10px] font-bold uppercase tracking-widest font-mono"
                 style={{ color: 'var(--eds-accent-2)' }}>
              Architectural Design
            </div>
            <h2 className="text-3xl font-extrabold" style={{ color: 'var(--eds-text)' }}>
              Why Traditional Webhook Implementations Fail
            </h2>
            <p className="text-sm max-w-xl mx-auto" style={{ color: 'var(--eds-muted)' }}>
              Synchronous HTTP webhooks degrade under traffic spikes. EDS Engine decouples ingestion
              from asynchronous execution.
            </p>
          </div>

          {/* Problem / Solution comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
            <div
              className="rounded-eds-lg p-8 space-y-5"
              style={{
                background: 'var(--eds-panel)',
                border: '1px solid rgba(244,63,94,0.18)',
              }}
            >
              <div className="flex items-center justify-between pb-4"
                   style={{ borderBottom: '1px solid rgba(244,63,94,0.15)' }}>
                <h3 className="text-base font-bold flex items-center gap-2"
                    style={{ color: 'var(--eds-danger-2)' }}>
                  <XCircle size={18} />
                  Synchronous Webhook Ingestion
                </h3>
                <span
                  className="text-[9px] font-bold font-mono uppercase px-2 py-0.5 rounded"
                  style={{
                    background: 'var(--eds-danger-dim)',
                    border: '1px solid rgba(244,63,94,0.2)',
                    color: 'var(--eds-danger-2)',
                  }}
                >
                  Legacy
                </span>
              </div>
              <ul className="space-y-3.5">
                {[
                  'Target API timeouts block primary web server worker threads.',
                  'Network dropouts cause unhandled event loss with no recovery.',
                  'No retry history, attempt counter, or dead-letter queue recovery.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-xs" style={{ color: 'var(--eds-muted)' }}>
                    <span style={{ color: 'var(--eds-danger-2)' }} className="mt-0.5 shrink-0">✕</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="rounded-eds-lg p-8 space-y-5"
              style={{
                background: 'var(--eds-panel)',
                border: '1px solid rgba(99,102,241,0.25)',
              }}
            >
              <div className="flex items-center justify-between pb-4"
                   style={{ borderBottom: '1px solid rgba(99,102,241,0.18)' }}>
                <h3 className="text-base font-bold flex items-center gap-2"
                    style={{ color: 'var(--eds-accent-2)' }}>
                  <CheckCircle2 size={18} />
                  EDS Asynchronous Pipeline
                </h3>
                <span
                  className="text-[9px] font-bold font-mono uppercase px-2 py-0.5 rounded"
                  style={{
                    background: 'var(--eds-accent-dim)',
                    border: '1px solid var(--eds-accent-ring)',
                    color: 'var(--eds-accent-2)',
                  }}
                >
                  EDS Enterprise
                </span>
              </div>
              <ul className="space-y-3.5">
                {[
                  'Sub-millisecond API response via RabbitMQ decoupled buffer layer.',
                  'Celery workers execute exponential backoff retries automatically.',
                  'Dead Letter Queue guarantees message persistence and replay.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-xs" style={{ color: 'var(--eds-text-2)' }}>
                    <span style={{ color: 'var(--eds-success)' }} className="mt-0.5 shrink-0">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={KeyRound}
              title="HMAC SHA-256 Signature Verification"
              desc="Every webhook payload is cryptographically signed. Tampering is detected before processing begins."
              iconBg="var(--eds-accent-dim)"
              iconColor="var(--eds-accent-2)"
            />
            <FeatureCard
              icon={Database}
              title="RabbitMQ Message Buffer"
              desc="Ingress is immediately acknowledged and queued, providing sub-millisecond response times under any load."
              iconBg="var(--eds-success-dim)"
              iconColor="var(--eds-success)"
            />
            <FeatureCard
              icon={RefreshCw}
              title="Exponential Backoff Retries"
              desc="Failed deliveries are automatically retried with jitter-based backoff, preventing thundering herd scenarios."
              iconBg="var(--eds-warning-dim)"
              iconColor="var(--eds-warning)"
            />
            <FeatureCard
              icon={Layers}
              title="Dead Letter Queue Recovery"
              desc="Failed events are persisted in DLQ with full payload history, retryable on-demand from the control plane."
              iconBg="var(--eds-danger-dim)"
              iconColor="var(--eds-danger-2)"
            />
            <FeatureCard
              icon={BarChart3}
              title="Real-Time Telemetry"
              desc="Live WebSocket dashboard streams latency percentiles, throughput, and delivery status in real time."
              iconBg="var(--eds-info-dim)"
              iconColor="var(--eds-info)"
            />
            <FeatureCard
              icon={Globe}
              title="Multi-Project Isolation"
              desc="Each project gets isolated API keys, event configs, and delivery queues with company-level observability."
              iconBg="var(--eds-accent-dim)"
              iconColor="var(--eds-accent-2)"
            />
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <footer
        className="relative z-10 py-10"
        style={{
          borderTop: '1px solid var(--eds-border)',
          background: 'var(--eds-bg)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={22} />
            <span className="text-xs font-bold font-mono" style={{ color: 'var(--eds-muted)' }}>
              EDS ENGINE © 2026
            </span>
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--eds-faint)' }}>
            Enterprise Event Delivery &amp; Observability Platform
          </div>
          <div className="flex items-center gap-5 text-xs" style={{ color: 'var(--eds-muted)' }}>
            <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link to="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
