import os

file_path = r'd:\internship\frontend\src\components\dashboard\MetricsDashboard.jsx'

new_content = """import { useEffect, useRef, useState, useCallback } from 'react';
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
  main_queue_count: 0,
  redis_status: 'CHECKING',
  redis_latency_ms: 0.0,
  rabbitmq_status: 'CHECKING',
};

// Skeleton shimmer for loading state
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-zinc-800/50 ${className}`} />;
}

// Smooth SVG Area Chart Component
function SmoothThroughputChart({ history, max }) {
  const width = 1000;
  const height = 160;
  
  if (!history || history.length < 2) return null;
  
  const points = history.map((val, idx) => {
    const x = (idx / (history.length - 1)) * width;
    const y = height - Math.max(4, (val / Math.max(max, 1)) * height);
    return `${x},${y}`;
  });
  
  const pathData = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;
  const lineData = `M ${points.join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible preserve-3d" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={pathData} fill="url(#areaGradient)" className="transition-all duration-500 ease-linear" />
      <path d={lineData} fill="none" stroke="url(#lineGradient)" strokeWidth="3" className="transition-all duration-500 ease-linear drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    </svg>
  );
}

export default function MetricsDashboard({ companyId, identityLabel = 'Operator Console' }) {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [projects, setProjects] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  // Fixed array length of 30 for smooth 1-min sliding window graph
  const [chartHistory, setChartHistory] = useState(() => Array(30).fill(0));

  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);

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
        setChartHistory((prev) => [...prev.slice(1), Math.max(0, d.throughput_rps ?? 0)]);
      }

      if (projectsRes.status === 'fulfilled' && Array.isArray(projectsRes.value?.data)) {
        const allProjects = projectsRes.value.data;
        setProjects(allProjects.slice(0, 5));
        if (allProjects[0]?.id) {
          try {
            const logsRes = await apiClient.get(`/v1/projects/${allProjects[0].id}/webhook-logs?limit=6`);
            if (Array.isArray(logsRes.data)) setRecentLogs(logsRes.data.slice(0, 6));
          } catch { /* silent */ }
        }
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  const applyStatsUpdate = useCallback((d) => {
    setStats(d);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setChartHistory((prev) => [...prev.slice(1), Math.max(0, d.throughput_rps ?? 0)]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatsFallback();
    apiClient.get(API_ENDPOINTS.PROJECTS.LIST).then((r) => {
      if (Array.isArray(r.data)) setProjects(r.data.slice(0, 5));
    }).catch(() => {});

    if (!companyId) return;

    const wsUrl = WS_ENDPOINTS.DASHBOARD(companyId);
    let ws;

    const connectWS = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          setWsConnected(true);
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
          pollTimerRef.current = setInterval(fetchStatsFallback, 3000);
        };
        ws.onerror = () => setWsConnected(false);
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

  const maxChart = Math.max(...chartHistory, 10); // Minimum scale of 10
  const hasDlq = stats.dlq_count > 0;
  const isRedisDegraded = stats.redis_status === 'DEGRADED' || stats.redis_status === 'OFFLINE';
  const isRmqDegraded = stats.rabbitmq_status === 'DEGRADED' || stats.rabbitmq_status === 'OFFLINE';

  return (
    <section className="space-y-5 text-zinc-100 font-sans">
      
      {/* ── WS CONNECTION STATUS STRIP ── */}
      <div className="flex items-center justify-between">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-mono font-medium transition ${
          wsConnected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse'
        }`}>
          <Activity size={12} className={wsConnected ? 'animate-spin' : ''} />
          {wsConnected ? 'LIVE WS STREAM' : 'POLLING FALLBACK'}
          {lastUpdated && <span className="opacity-60 ml-1">· {lastUpdated}</span>}
        </div>
        <button
          onClick={fetchStatsFallback}
          className="inline-flex items-center gap-1.5 rounded-md text-zinc-400 hover:text-zinc-200 px-3 py-1.5 text-xs font-medium transition"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* ── TOP STAT CARDS ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        
        {/* Total Volume */}
        <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-5 shadow-sm hover:border-zinc-700 transition">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-medium">Total Webhooks</span>
            <Zap size={14} />
          </div>
          <div className="mt-3">
            {loading ? <Skeleton className="h-8 w-24" /> : <h3 className="text-2xl font-semibold text-white tracking-tight">{stats.total_webhooks.toLocaleString()}</h3>}
          </div>
          <div className="mt-2 flex items-center text-xs text-emerald-400">
            <TrendingUp size={12} className="mr-1" />
            <span>{stats.throughput_rps} rps live</span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-5 shadow-sm hover:border-zinc-700 transition">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-medium">Success Rate</span>
            <CheckCircle2 size={14} />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {loading ? <Skeleton className="h-8 w-16" /> : <h3 className="text-2xl font-semibold text-white tracking-tight">{stats.success_rate}%</h3>}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            {stats.success_count.toLocaleString()} successful
          </div>
        </div>

        {/* Avg Latency */}
        <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-5 shadow-sm hover:border-zinc-700 transition">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-medium">Avg Latency</span>
            <Clock size={14} />
          </div>
          <div className="mt-3">
            {loading ? <Skeleton className="h-8 w-16" /> : <h3 className="text-2xl font-semibold text-white tracking-tight">{stats.avg_latency_ms} ms</h3>}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            End-to-end processing time
          </div>
        </div>

        {/* Main Queue */}
        <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-5 shadow-sm hover:border-zinc-700 transition">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-medium">Main Queue</span>
            <Server size={14} />
          </div>
          <div className="mt-3">
            {loading ? <Skeleton className="h-8 w-12" /> : <h3 className="text-2xl font-semibold text-white tracking-tight">{stats.main_queue_count}</h3>}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Processing in real-time
          </div>
        </div>

        {/* DLQ */}
        <div className={`rounded-xl border p-5 shadow-sm transition ${hasDlq ? 'border-rose-500/50 bg-rose-500/5' : 'border-zinc-800/60 bg-[#0A0A0A] hover:border-zinc-700'}`}>
          <div className="flex justify-between items-center">
            <span className={`text-xs font-medium ${hasDlq ? 'text-rose-400' : 'text-zinc-400'}`}>Dead Letter Queue</span>
            <AlertTriangle size={14} className={hasDlq ? 'text-rose-400' : 'text-zinc-400'} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            {loading ? <Skeleton className="h-8 w-12" /> : <h3 className={`text-2xl font-semibold tracking-tight ${hasDlq ? 'text-rose-500' : 'text-white'}`}>{stats.dlq_count}</h3>}
            {hasDlq && (
              <Link to="/dlq" className="text-xs text-rose-400 hover:text-rose-300 flex items-center">
                Manage <ArrowUpRight size={12} className="ml-1" />
              </Link>
            )}
          </div>
          <div className={`mt-2 text-xs ${hasDlq ? 'text-rose-400/80' : 'text-zinc-500'}`}>
            {hasDlq ? 'Failed messages await manual replay' : 'No failed messages'}
          </div>
        </div>

      </div>

      {/* ── MAIN 2-COLUMN CONTENT ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* LEFT: SMOOTH AREA CHART */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
                <h3 className="text-sm font-medium text-zinc-100">Live Throughput</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Total RPM:</span>
                <span className="rounded bg-zinc-900 px-2 py-1 text-xs font-mono font-medium text-emerald-400 border border-zinc-800">
                  {stats.throughput_rpm}
                </span>
              </div>
            </div>
            
            <div className="mt-6">
              <div className="relative h-40 w-full overflow-hidden rounded-md border-b border-zinc-800/50 pb-2">
                <SmoothThroughputChart history={chartHistory} max={maxChart} />
              </div>
              <div className="mt-3 flex justify-between text-[10px] text-zinc-500 font-medium">
                <span>~30s ago</span>
                <span>~15s ago</span>
                <span className="text-emerald-500 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span> Now</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: INFRA STATUS + PROJECTS */}
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-5 shadow-sm">
            <h3 className="text-sm font-medium text-zinc-100 mb-4">Infrastructure Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${isRedisDegraded ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  <div>
                    <p className="text-xs font-medium text-zinc-200">Redis Cache</p>
                    <p className="text-[10px] text-zinc-500">{stats.redis_latency_ms} ms ping</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-medium uppercase ${isRedisDegraded ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {stats.redis_status}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${isRmqDegraded ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  <div>
                    <p className="text-xs font-medium text-zinc-200">RabbitMQ Broker</p>
                    <p className="text-[10px] text-zinc-500">Event mesh</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-medium uppercase ${isRmqDegraded ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {stats.rabbitmq_status}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-100">Projects</h3>
              <Link to="/projects" className="text-xs text-emerald-500 hover:text-emerald-400">View All</Link>
            </div>
            {projects.length === 0 ? (
              loading ? <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div> : <p className="text-xs text-zinc-500">No projects yet.</p>
            ) : (
              <div className="space-y-2">
                {projects.map((proj) => (
                  <Link key={proj.id} to={`/projects/${proj.id}`} className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2.5 hover:bg-zinc-800/50 transition">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${proj.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      <span className="text-xs font-medium text-zinc-300 truncate">{proj.name}</span>
                    </div>
                    <ArrowUpRight size={14} className="text-zinc-600" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── RECENT LOGS ── */}
      {recentLogs.length > 0 && (
        <div className="rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-zinc-400" />
              <h3 className="text-sm font-medium text-zinc-100">Recent Ingress</h3>
            </div>
            <Link to="/logs" className="text-xs text-emerald-500 hover:text-emerald-400">View Logs</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800/50 text-zinc-500">
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Event Type</th>
                  <th className="py-2.5 px-3 font-medium">Method</th>
                  <th className="py-2.5 px-3 font-medium">Duration</th>
                  <th className="py-2.5 px-3 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30">
                {recentLogs.map((log) => {
                  const code = log.metadata?.response_code ?? (log.level === 'SUCCESS' ? 200 : 500);
                  const isSuccess = code >= 200 && code < 300;
                  return (
                    <tr key={log.id} className="hover:bg-zinc-900/50 transition">
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                          {code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">{log.metadata?.event_type ?? 'webhook.received'}</td>
                      <td className="py-2.5 px-3 text-zinc-500">{log.metadata?.http_method ?? 'POST'}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{log.metadata?.processing_duration_ms ?? '—'} ms</td>
                      <td className="py-2.5 px-3 text-right text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
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
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
