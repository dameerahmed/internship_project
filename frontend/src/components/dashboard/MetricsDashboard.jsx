import { useEffect, useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
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
    redis_latency_ms: 0.0,
    rabbitmq_status: 'ONLINE',
  });

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStats = async () => {
    try {
      const { data } = await apiClient.get('/v1/dashboard/stats');
      if (data) {
        setStats(data);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch {
      // Silent
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

  const handleRetryAll = async () => {
    if (!window.confirm('Re-queue all failed DLQ webhooks back to RabbitMQ broker?')) return;
    setActionLoading(true);
    try {
      await apiClient.post('/v1/dlq/replay', { log_ids: 'all' });
      await fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscardAll = async () => {
    if (!window.confirm('Permanently discard all failed DLQ webhooks? This cannot be undone.')) return;
    setActionLoading(true);
    try {
      await apiClient.post('/v1/dlq/discard', { log_ids: 'all' });
      await fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const hasDlqBacklog = stats.dlq_count > 0;

  return (
    <section className="space-y-6">
      
      {/* 4 CORE REAL-TIME OPERATIONAL METRIC CARDS */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Real-time Ingestion Speed */}
        <div className="rounded-2xl border border-zinc-800 bg-[#08090e] p-5 shadow-xl relative overflow-hidden group hover:border-zinc-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">INGESTION SPEED</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Zap size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-black font-mono text-white tracking-tight">{stats.throughput_rps} <span className="text-xs font-normal text-zinc-400">req/sec</span></p>
            <span className="text-xs font-mono font-bold text-emerald-400">{stats.throughput_rpm} req/min</span>
          </div>
          <p className="mt-2 text-[11px] font-mono text-zinc-400">Live incoming webhooks per second</p>
        </div>

        {/* Delivery Success Rate */}
        <div className="rounded-2xl border border-zinc-800 bg-[#08090e] p-5 shadow-xl relative overflow-hidden group hover:border-zinc-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">DELIVERY SUCCESS RATE</span>
            <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <CheckCircle2 size={16} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-black font-mono text-white tracking-tight">{stats.success_rate}%</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500" style={{ width: `${stats.success_rate}%` }} />
          </div>
          <p className="mt-2 text-[11px] font-mono text-zinc-400">{stats.success_count} passed • {stats.failed_count} failed</p>
        </div>

        {/* DLQ Backlog Metrics */}
        <div className={`rounded-2xl border p-5 shadow-xl relative overflow-hidden group transition ${hasDlqBacklog ? 'border-rose-500/40 bg-rose-950/10' : 'border-zinc-800 bg-[#08090e]'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">DEAD LETTER QUEUE (DLQ)</span>
            <span className={`p-2 rounded-xl border ${hasDlqBacklog ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className={`text-3xl font-black font-mono tracking-tight ${hasDlqBacklog ? 'text-rose-400' : 'text-white'}`}>{stats.dlq_count}</p>
            <Link to="/dlq" className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-rose-400 hover:underline">
              <span>Open DLQ Workspace</span>
              <ArrowRight size={11} />
            </Link>
          </div>
          <p className="mt-2 text-[11px] font-mono text-zinc-400">Failed payloads awaiting retry push</p>
        </div>

        {/* Avg Response Latency */}
        <div className="rounded-2xl border border-zinc-800 bg-[#08090e] p-5 shadow-xl relative overflow-hidden group hover:border-zinc-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">RESPONSE LATENCY</span>
            <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Clock size={16} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-black font-mono text-white tracking-tight">{stats.avg_latency_ms} <span className="text-base font-normal text-zinc-400">ms</span></p>
          <p className="mt-2 text-[11px] font-mono text-zinc-400">Average target delivery duration</p>
        </div>

      </div>

      {/* INFRASTRUCTURE HEALTH & QUICK CONTROL CENTRE */}
      <div className="grid gap-5 md:grid-cols-2 mt-6">
        
        {/* Real-time Infrastructure Queue Health */}
        <div className="rounded-2xl border border-zinc-800 bg-[#08090e] p-5 shadow-xl">
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/50 pb-2 mb-4">
            Infrastructure Status
          </h3>
          
          <div className="space-y-4">
            {/* Redis Status */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)] animate-pulse ${stats.redis_status === 'ONLINE' ? 'bg-emerald-400' : 'bg-rose-505'}`} />
                <div>
                  <p className="text-xs font-mono font-black text-white uppercase">Redis Cache Engine</p>
                  <p className="text-[10px] font-mono text-zinc-500">Shared connection pool latency</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black border ${stats.redis_status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                  {stats.redis_status || 'ONLINE'}
                </span>
                <p className="text-[11px] font-mono text-zinc-400 mt-1 font-bold">{stats.redis_latency_ms || 0.5} ms</p>
              </div>
            </div>

            {/* RabbitMQ Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse ${stats.rabbitmq_status === 'ONLINE' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                <div>
                  <p className="text-xs font-mono font-black text-white uppercase">RabbitMQ Broker</p>
                  <p className="text-[10px] font-mono text-zinc-500">Celery worker consumer state</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black border ${stats.rabbitmq_status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                  {stats.rabbitmq_status || 'ONLINE'}
                </span>
                <p className="text-[11px] font-mono text-emerald-400 mt-1 font-bold">1 active cluster</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick DLQ Control Panel */}
        <div className="rounded-2xl border border-zinc-800 bg-[#08090e] p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/50 pb-2 mb-3">
              Quick DLQ Actions
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
              If there is a failed delivery backlog, you can retry sending the payloads or discard them from the queue system in a single batch operation.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled={!hasDlqBacklog || actionLoading}
              onClick={handleRetryAll}
              className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 disabled:hover:bg-transparent px-3 py-2 text-xs font-mono font-bold text-emerald-400 transition active:scale-95 shadow-sm"
            >
              {actionLoading ? 'PROCESSING...' : 'RETRY ALL FAILED'}
            </button>

            <button
              disabled={!hasDlqBacklog || actionLoading}
              onClick={handleDiscardAll}
              className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 disabled:hover:bg-transparent px-3 py-2 text-xs font-mono font-bold text-rose-400 transition active:scale-95 shadow-sm"
            >
              {actionLoading ? 'PROCESSING...' : 'DISCARD ALL FAILED'}
            </button>
          </div>
        </div>
      </div>

    </section>
  );
}
