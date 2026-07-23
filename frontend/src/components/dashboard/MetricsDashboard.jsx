import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  TrendingUp,
  Zap,
  Terminal,
  Database,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '@/api/client';
import { API_ENDPOINTS, WS_ENDPOINTS } from '@/utils/constants';

const EMPTY_STATS = {
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
  redis_status: 'CHECKING',
  redis_latency_ms: 0.0,
  rabbitmq_status: 'CHECKING',
};

// Pulse dot for stat cards
function LiveDot({ color = 'emerald' }) {
  return (
    <span className={`relative flex h-2 w-2`}>
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${color}-400 opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 bg-${color}-400`} />
    </span>
  );
}

// Skeleton shimmer for loading state
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

export default function MetricsDashboard({ companyId, identityLabel = 'Operator Console' }) {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [projects, setProjects] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  // Chart history: starts all-zero, grows organically from REAL throughput_rpm values
  const [chartHistory, setChartHistory] = useState(() => Array(16).fill(0));

  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);

  // REST fallback fetch (runs once on mount and whenever WS is disconnected)
  const fetchStatsFallback = useCallback(async () => {
    try {
      const [statsRes, projectsRes] = await Promise.allSettled([
        apiClient.get('/v1/dashboard/stats'),
        apiClient.get(API_ENDPOINTS.PROJECTS.LIST),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value?.data) {
        const d = statsRes.value.data;
        setStats(d);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setChartHistory((prev) => {
          const next = Math.max(0, d.throughput_rpm ?? 0);
          return [...prev.slice(1), next];
        });
      }

      if (projectsRes.status === 'fulfilled' && Array.isArray(projectsRes.value?.data)) {
        const allProjects = projectsRes.value.data;
        setProjects(allProjects.slice(0, 5));

        // Fetch recent logs for the first project
        if (allProjects[0]?.id) {
          try {
            const logsRes = await apiClient.get(
              `/v1/projects/${allProjects[0].id}/webhook-logs?limit=6`
            );
            if (Array.isArray(logsRes.data)) setRecentLogs(logsRes.data.slice(0, 6));
          } catch { /* silent */ }
        }
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  // Apply a DASHBOARD_UPDATE message from WS
  const applyStatsUpdate = useCallback((d) => {
    setStats(d);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setChartHistory((prev) => {
      const next = Math.max(0, d.throughput_rpm ?? 0);
      return [...prev.slice(1), next];
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial REST load immediately (fills UI before WS handshake)
    fetchStatsFallback();
    // Also load projects list independently
    apiClient.get(API_ENDPOINTS.PROJECTS.LIST).then((r) => {
      if (Array.isArray(r.data)) setProjects(r.data.slice(0, 5));
    }).catch(() => {});

    if (!companyId) return;

    // --- WebSocket live stream ---
    const wsUrl = WS_ENDPOINTS.DASHBOARD(companyId);
    let ws;

    const connectWS = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          // Clear polling fallback — WS will drive updates
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'DASHBOARD_UPDATE') applyStatsUpdate(msg);
          } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
          setWsConnected(false);
          // Fall back to polling every 3s when WS drops
          pollTimerRef.current = setInterval(fetchStatsFallback, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
        pollTimerRef.current = setInterval(fetchStatsFallback, 3000);
      }
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [companyId, fetchStatsFallback, applyStatsUpdate]);

  const maxChart = Math.max(...chartHistory, 1);
  const hasDlq = stats.dlq_count > 0;
  const isRedisDegraded = stats.redis_status === 'DEGRADED' || stats.redis_status === 'OFFLINE';
  const isRmqDegraded = stats.rabbitmq_status === 'DEGRADED' || stats.rabbitmq_status === 'OFFLINE';

  return (
    <section className="space-y-5 text-zinc-100">

      {/* ── WS CONNECTION STATUS STRIP ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-mono font-bold transition ${
          wsConnected
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-400 animate-pulse'
        }`}>
          <Activity size={11} className={wsConnected ? 'animate-spin' : ''} />
          {wsConnected ? 'LIVE WEBSOCKET STREAM ACTIVE' : 'REST POLLING FALLBACK (3s)'}
          {lastUpdated && <span className="opacity-60 ml-1">· {lastUpdated}</span>}
        </div>
        <button
          onClick={fetchStatsFallback}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#111320] hover:bg-zinc-800 px-3 py-1.5 text-xs font-mono font-bold text-zinc-300 transition active:scale-95"
        >
          <RefreshCw size={12} />
          FORCE REFRESH
        </button>
      </div>

      {/* ── TOP STAT CARDS ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        {/* Total Webhook Volume */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-[#11131f] to-[#0a0b12] p-5 shadow-xl transition hover:border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">TOTAL WEBHOOK VOLUME</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Zap size={16} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            {loading
              ? <Skeleton className="h-9 w-28" />
              : <h3 className="text-3xl font-black font-mono tracking-tight text-white">{stats.total_webhooks.toLocaleString()}</h3>
            }
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-400">
              <TrendingUp size={11} />
              {stats.throughput_rps} rps
            </span>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Live webhook ingress · all your endpoints</p>
        </div>

        {/* Successful Deliveries */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-[#11131f] to-[#0a0b12] p-5 shadow-xl transition hover:border-cyan-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">SUCCESSFUL DELIVERIES</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <CheckCircle2 size={16} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            {loading
              ? <Skeleton className="h-9 w-20" />
              : <h3 className="text-3xl font-black font-mono tracking-tight text-white">{stats.success_rate}%</h3>
            }
            <span className="text-xs font-mono font-bold text-cyan-400">{stats.success_count} Passed</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
            <div
              className={`h-full rounded-full transition-all duration-700 ${stats.success_rate >= 90 ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : stats.success_rate >= 70 ? 'bg-amber-400' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(100, Math.max(0, stats.success_rate))}%` }}
            />
          </div>
        </div>

        {/* Avg Response Latency */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-[#11131f] to-[#0a0b12] p-5 shadow-xl transition hover:border-purple-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">AVG RESPONSE LATENCY</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Clock size={16} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            {loading
              ? <Skeleton className="h-9 w-24" />
              : (
                <h3 className="text-3xl font-black font-mono tracking-tight text-white">
                  {stats.avg_latency_ms > 0 ? stats.avg_latency_ms : '—'}
                  <span className="text-base font-normal text-zinc-400"> ms</span>
                </h3>
              )
            }
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold ${
              stats.avg_latency_ms === 0 ? 'border-zinc-700 bg-zinc-800 text-zinc-400'
              : stats.avg_latency_ms < 500 ? 'border-purple-500/20 bg-purple-500/10 text-purple-400'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
            }`}>
              {stats.avg_latency_ms === 0 ? 'No data' : stats.avg_latency_ms < 500 ? 'Ultra Fast' : 'Nominal'}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Average target server response time</p>
        </div>

        {/* DLQ / Failed Payloads — reads from RabbitMQ directly */}
        <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-xl transition ${
          hasDlq ? 'border-rose-500/50 bg-rose-950/20' : 'border-zinc-800/80 bg-gradient-to-b from-[#11131f] to-[#0a0b12] hover:border-zinc-700'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">FAILED PAYLOADS (DLQ)</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
              hasDlq ? 'border-rose-500/40 bg-rose-500/20 text-rose-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}>
              <AlertTriangle size={16} className={hasDlq ? 'animate-pulse' : ''} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            {loading
              ? <Skeleton className="h-9 w-16" />
              : <h3 className={`text-3xl font-black font-mono tracking-tight ${hasDlq ? 'text-rose-400' : 'text-white'}`}>{stats.dlq_count}</h3>
            }
            <Link to="/dlq" className="inline-flex items-center gap-1 text-xs font-mono font-bold text-rose-400 hover:underline">
              <span>DLQ Page</span>
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {hasDlq ? `${stats.dlq_count} message${stats.dlq_count > 1 ? 's' : ''} in RabbitMQ DLQ` : 'No failed messages in DLQ'}
          </p>
        </div>

      </div>

      {/* ── MAIN 2-COLUMN CONTENT ──────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* LEFT: LIVE THROUGHPUT CHART (2/3) */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-800/80 bg-[#0c0d15] p-6 shadow-xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <LiveDot color="emerald" />
                <h3 className="text-sm font-mono font-black uppercase tracking-wider text-white">
                  Real-Time Traffic Ingestion
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">Live webhook request volume from PostgreSQL · 2s window</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="rounded-lg border border-zinc-800 bg-[#121420] px-2.5 py-1 text-xs font-mono font-bold text-emerald-400">
                {stats.throughput_rpm} req/min
              </span>
            </div>
          </div>

          {/* Bar chart — all values are REAL throughput_rpm snapshots */}
          <div className="mt-5">
            <div className="flex items-end gap-1.5 h-40 w-full pt-2 pb-2 border-b border-zinc-800/60">
              {chartHistory.map((val, idx) => {
                const heightPct = Math.max(4, Math.round((val / maxChart) * 100));
                const isLatest = idx === chartHistory.length - 1;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-500 ${
                        isLatest
                          ? 'bg-gradient-to-t from-emerald-500 to-cyan-300 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                          : 'bg-gradient-to-t from-emerald-500/20 via-emerald-500/50 to-cyan-400/70 group-hover:from-emerald-400/30'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-zinc-500">
              <span>~32s ago</span>
              <span>~16s ago</span>
              <span>~8s ago</span>
              <span className="text-emerald-400 font-bold">LIVE NOW</span>
            </div>
          </div>

          {/* Quick metrics strip */}
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800/60 pt-4 text-center">
            <div>
              <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Active Projects</p>
              <p className="mt-1 text-lg font-black font-mono text-white">{stats.active_projects} / {stats.total_projects}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Event Rules</p>
              <p className="mt-1 text-lg font-black font-mono text-white">{stats.total_event_routes}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Total Processed</p>
              <p className="mt-1 text-lg font-black font-mono text-emerald-400">{stats.total_webhooks.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* RIGHT: INFRA STATUS + PROJECTS (1/3) */}
        <div className="space-y-5">

          {/* Infrastructure Status Card */}
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0c0d15] p-5 shadow-xl">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/60 pb-3 mb-4">
              Infrastructure Status
            </h3>
            <div className="space-y-3">

              {/* Redis */}
              <div className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-[#111320] p-3">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${isRedisDegraded ? 'bg-rose-500' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'}`} />
                  <div>
                    <p className="text-xs font-mono font-bold text-white">Redis Cache</p>
                    <p className="text-[10px] font-mono text-zinc-500">Fast key-value storage</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold border ${
                    isRedisDegraded
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {stats.redis_status}
                  </span>
                  <p className="mt-1 text-[10px] font-mono text-zinc-400">{stats.redis_latency_ms} ms</p>
                </div>
              </div>

              {/* RabbitMQ */}
              <div className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-[#111320] p-3">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${isRmqDegraded ? 'bg-rose-500' : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'}`} />
                  <div>
                    <p className="text-xs font-mono font-bold text-white">RabbitMQ Broker</p>
                    <p className="text-[10px] font-mono text-zinc-500">Celery worker consumer</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold border ${
                    isRmqDegraded
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  }`}>
                    {stats.rabbitmq_status}
                  </span>
                  <p className="mt-1 text-[10px] font-mono text-cyan-400">
                    {hasDlq ? `${stats.dlq_count} in DLQ` : '0 in DLQ'}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Active Projects List */}
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0c0d15] p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-3">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Your Projects</h3>
              <Link to="/projects" className="text-[11px] font-mono font-bold text-emerald-400 hover:underline">View All →</Link>
            </div>
            {projects.length === 0 ? (
              loading
                ? <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                : <p className="py-4 text-center text-xs text-zinc-500">No projects created yet.</p>
            ) : (
              <div className="space-y-2">
                {projects.map((proj) => (
                  <Link
                    key={proj.id}
                    to={`/projects/${proj.id}`}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/40 bg-[#111320] p-2.5 hover:border-zinc-700 transition"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${proj.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      <span className="text-xs font-semibold text-zinc-200 truncate">{proj.name}</span>
                    </div>
                    <ArrowUpRight size={13} className="text-zinc-500 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── RECENT WEBHOOK LOG STREAM ──────────────────────────── */}
      {recentLogs.length > 0 && (
        <div className="rounded-2xl border border-zinc-800/80 bg-[#0c0d15] p-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-emerald-400" />
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">Recent Ingress Log</h3>
            </div>
            <Link to="/logs" className="text-xs font-mono font-bold text-emerald-400 hover:underline">Full Logs →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-500 uppercase text-[10px]">
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Event Type</th>
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Duration</th>
                  <th className="py-2 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                {recentLogs.map((log) => {
                  const code = log.metadata?.response_code ?? (log.level === 'SUCCESS' ? 200 : 500);
                  const isSuccess = code >= 200 && code < 300;
                  return (
                    <tr key={log.id} className="hover:bg-zinc-800/20 transition">
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${
                          isSuccess ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">{log.metadata?.event_type ?? 'webhook.received'}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{log.metadata?.http_method ?? 'POST'}</td>
                      <td className="py-2.5 px-3 text-purple-400">{log.metadata?.processing_duration_ms ?? '—'} ms</td>
                      <td className="py-2.5 px-3 text-right text-zinc-500">{log.timestamp ?? 'Just now'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </section>
  );
}
