import { useEffect, useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Layers, 
  RefreshCw, 
  Server, 
  ShieldCheck, 
  Zap 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '@/api/client';

export default function MetricsDashboard({ identityLabel = 'Operator Console' }) {
  const [stats, setStats] = useState({
    total_projects: 0,
    active_projects: 0,
    total_event_routes: 0,
    total_webhooks: 0,
    throughput_rpm: 0,
    throughput_rps: 0.0,
    success_count: 0,
    failed_count: 0,
    success_rate: 100.0,
    avg_latency_ms: 0.0,
    dlq_count: 0,
    redis_status: 'ONLINE',
    redis_latency_ms: 0.5,
    rabbitmq_status: 'ONLINE',
  });

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      setIsRefreshing(true);
      const { data } = await apiClient.get('/v1/dashboard/stats');
      if (data) {
        setStats(data);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch {
      // Silent catch
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const runFetch = async () => {
      try {
        const { data } = await apiClient.get('/v1/dashboard/stats');
        if (!cancelled && data) {
          setStats(data);
          setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      } catch {
        // Silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runFetch();
    const interval = setInterval(runFetch, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const hasDlqBacklog = stats.dlq_count > 0;

  return (
    <section className="space-y-6">
      
      {/* REAL-TIME LIVE MONITORING HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-zinc-800/80 bg-[#0a0b12]/90 p-4 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono font-black uppercase tracking-wider text-emerald-400">
                LIVE REAL-TIME TELEMETRY ENGINE
              </h2>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                AUTO-SYNC 2s
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Live event traffic, response speeds, and server health for <strong className="text-zinc-200">{identityLabel}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="text-[11px] font-mono text-zinc-500">
            Updated: <span className="text-zinc-300 font-bold">{lastUpdated || 'Syncing…'}</span>
          </span>
          <button
            onClick={fetchStats}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#121420] px-2.5 py-1.5 text-xs font-mono font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition active:scale-95 disabled:opacity-50"
            title="Manual Refresh"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* QUICK INFRASTRUCTURE OVERVIEW BAR */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Active Projects */}
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-[#08090e] p-4 shadow-md transition hover:border-zinc-700">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Layers size={18} />
          </div>
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Active Projects</p>
            <p className="text-lg font-black font-mono text-white">
              {stats.active_projects} <span className="text-xs font-normal text-zinc-500">/ {stats.total_projects} total</span>
            </p>
          </div>
        </div>

        {/* Configured Event Routes */}
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-[#08090e] p-4 shadow-md transition hover:border-zinc-700">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Activity size={18} />
          </div>
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Configured Routes</p>
            <p className="text-lg font-black font-mono text-white">
              {stats.total_event_routes} <span className="text-xs font-normal text-zinc-400">active rules</span>
            </p>
          </div>
        </div>

        {/* Engine Status */}
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-[#08090e] p-4 shadow-md transition hover:border-zinc-700">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Cache & Broker Engine</p>
            <div className="flex items-center gap-2 text-xs font-mono font-bold">
              <span className="text-emerald-400">Redis: {stats.redis_status}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-cyan-400">RMQ: {stats.rabbitmq_status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 CORE REAL-TIME OPERATIONAL METRIC CARDS */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Real-time Ingestion Speed */}
        <div className="rounded-2xl border border-zinc-800/80 bg-[#08090e] p-5 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition duration-300">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">LIVE TRAFFIC SPEED</span>
              <p className="text-[10px] text-zinc-500">Incoming webhooks per second</p>
            </div>
            <span className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition duration-300">
              <Zap size={18} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <p className="text-3xl font-black font-mono text-white tracking-tight">
              {stats.throughput_rps} <span className="text-xs font-normal text-zinc-400">req/s</span>
            </p>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {stats.throughput_rpm} / min
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-zinc-900 pt-2">
            <span>Total Processed:</span>
            <span className="font-bold text-zinc-200">{stats.total_webhooks.toLocaleString()} events</span>
          </div>
        </div>

        {/* Delivery Success Rate */}
        <div className="rounded-2xl border border-zinc-800/80 bg-[#08090e] p-5 shadow-xl relative overflow-hidden group hover:border-cyan-500/30 transition duration-300">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">SUCCESSFUL DELIVERIES</span>
              <p className="text-[10px] text-zinc-500">Target response 2xx OK ratio</p>
            </div>
            <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-110 transition duration-300">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <p className="mt-4 text-3xl font-black font-mono text-white tracking-tight">{stats.success_rate}%</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800/80">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${stats.success_rate >= 90 ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' : stats.success_rate >= 70 ? 'bg-amber-400' : 'bg-rose-500'}`} 
              style={{ width: `${Math.min(100, Math.max(0, stats.success_rate))}%` }} 
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-zinc-900 pt-2">
            <span className="text-emerald-400 font-medium">✓ {stats.success_count} Passed</span>
            <span className={stats.failed_count > 0 ? 'text-rose-400 font-medium' : 'text-zinc-500'}>✗ {stats.failed_count} Failed</span>
          </div>
        </div>

        {/* Avg Response Speed / Latency */}
        <div className="rounded-2xl border border-zinc-800/80 bg-[#08090e] p-5 shadow-xl relative overflow-hidden group hover:border-purple-500/30 transition duration-300">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">AVERAGE RESPONSE SPEED</span>
              <p className="text-[10px] text-zinc-500">Delivery duration (milliseconds)</p>
            </div>
            <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110 transition duration-300">
              <Clock size={18} />
            </span>
          </div>
          <p className="mt-4 text-3xl font-black font-mono text-white tracking-tight">
            {stats.avg_latency_ms} <span className="text-base font-normal text-zinc-400">ms</span>
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-zinc-900 pt-2">
            <span>Redis Cache Latency:</span>
            <span className="font-bold text-purple-400">{stats.redis_latency_ms || 0.5} ms</span>
          </div>
        </div>

        {/* Dead Letter Queue (DLQ) Backlog */}
        <div className={`rounded-2xl border p-5 shadow-xl relative overflow-hidden group transition duration-300 ${hasDlqBacklog ? 'border-rose-500/50 bg-rose-950/20' : 'border-zinc-800/80 bg-[#08090e] hover:border-zinc-700'}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">FAILED PAYLOADS (DLQ)</span>
              <p className="text-[10px] text-zinc-500">Retries & undelivered queue</p>
            </div>
            <span className={`p-2 rounded-xl border transition ${hasDlqBacklog ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-bounce' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <p className={`text-3xl font-black font-mono tracking-tight ${hasDlqBacklog ? 'text-rose-400' : 'text-white'}`}>
              {stats.dlq_count}
            </p>
            <Link 
              to="/dlq" 
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-mono font-bold text-rose-400 hover:bg-rose-500/20 transition active:scale-95"
            >
              <span>View Queue</span>
              <ArrowRight size={12} />
            </Link>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-zinc-900 pt-2">
            <span>Status:</span>
            <span className={hasDlqBacklog ? 'font-bold text-rose-400' : 'font-bold text-emerald-400'}>
              {hasDlqBacklog ? `${stats.dlq_count} require attention` : 'All Clear (0 failed)'}
            </span>
          </div>
        </div>

      </div>

    </section>
  );
}
