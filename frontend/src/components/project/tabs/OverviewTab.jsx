import React, { useEffect, useState, useMemo } from 'react';
import { 
  RefreshCw, ArrowUpRight, Activity, Clock, Layers, Zap, 
  CheckCircle2, AlertTriangle, Inbox, RotateCcw, ShieldCheck,
  TrendingUp, TrendingDown, ArrowRight
} from 'lucide-react';
import apiClient from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { API_ENDPOINTS, WS_ENDPOINTS, withToken } from '@/utils/constants';

export default function OverviewTab({ project, onNavigateTab }) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState(null);

  const loadData = async (silent = false) => {
    if (!project?.id) return;
    if (!silent && !metrics) {
      setLoading(true);
    }
    try {
      const [metricsRes, logsRes] = await Promise.allSettled([
        apiClient.get(API_ENDPOINTS.METRICS.PROJECT(project.id)),
        apiClient.get(`/v1/projects/${project.id}/logs?limit=8`)
      ]);

      if (metricsRes.status === 'fulfilled') {
        setMetrics(metricsRes.value.data);
      }
      if (logsRes.status === 'fulfilled') {
        const rawLogs = Array.isArray(logsRes.value.data) ? logsRes.value.data : (logsRes.value.data?.logs || []);
        setRecentLogs(rawLogs);
      }
    } catch (err) {
      console.error('Failed to load project overview data:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData(false);

    let metricsSocket = null;
    let logsSocket = null;
    let reconnectTimer = null;
    let retryCount = 0;

    const connectMetricsSocket = () => {
      const token = user?.access_token || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))?.access_token : null);
      if (!token || !project?.id) return;

      const wsUrl = withToken(`${WS_ENDPOINTS.DASHBOARD()}?project_id=${project.id}`, token);
      try {
        metricsSocket = new WebSocket(wsUrl);
        metricsSocket.onopen = () => { retryCount = 0; };
        metricsSocket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'DASHBOARD_UPDATE' || payload.total_webhooks_24h !== undefined || payload.total_webhooks !== undefined) {
              setMetrics((prev) => ({
                ...(prev || {}),
                ...payload,
                total_webhooks_24h: payload.total_webhooks_24h ?? payload.total_webhooks ?? prev?.total_webhooks_24h ?? 0,
                success_rate_pct: payload.success_rate_pct ?? payload.success_rate ?? prev?.success_rate_pct ?? null,
                failure_rate_pct: payload.failure_rate_pct ?? payload.failure_rate ?? prev?.failure_rate_pct ?? 0,
                avg_latency_ms: payload.avg_latency_ms ?? prev?.avg_latency_ms ?? 0,
                p50_latency_ms: payload.p50_latency_ms ?? prev?.p50_latency_ms ?? 0,
                p90_latency_ms: payload.p90_latency_ms ?? prev?.p90_latency_ms ?? 0,
                p95_latency_ms: payload.p95_latency_ms ?? prev?.p95_latency_ms ?? 0,
                p99_latency_ms: payload.p99_latency_ms ?? prev?.p99_latency_ms ?? 0,
                dlq_count: payload.dlq_count ?? payload.total_dlq_count ?? prev?.dlq_count ?? 0,
                throughput_series: (payload.throughput_series && payload.throughput_series.length > 0) ? payload.throughput_series : (prev?.throughput_series || []),
              }));
            }
          } catch (err) {
            console.warn('Project metrics WS parse error:', err);
          }
        };
        metricsSocket.onclose = () => {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount += 1;
          reconnectTimer = setTimeout(connectMetricsSocket, delay);
        };
        metricsSocket.onerror = () => {
          try { metricsSocket.close(); } catch {}
        };
      } catch (err) {
        console.warn('Project metrics WS error:', err);
      }
    };

    const connectLogsSocket = () => {
      const token = user?.access_token || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))?.access_token : null);
      if (!token || !project?.id) return;

      const wsUrl = withToken(WS_ENDPOINTS.LOGS(project.id), token);
      try {
        logsSocket = new WebSocket(wsUrl);
        logsSocket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.id) {
              setRecentLogs((prev) => {
                const exists = prev.some((log) => log.id === payload.id);
                if (exists) return prev;
                return [payload, ...prev].slice(0, 8);
              });
            }
          } catch (err) {
            console.warn('Project logs WS parse error:', err);
          }
        };
      } catch (err) {
        console.warn('Project logs WS error:', err);
      }
    };

    connectMetricsSocket();
    connectLogsSocket();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (metricsSocket) metricsSocket.close();
      if (logsSocket) logsSocket.close();
    };
  }, [project?.id, user?.access_token]);

  const m = metrics || {
    total_webhooks_24h: 0,
    success_rate_pct: null,
    failure_rate_pct: 0.0,
    avg_latency_ms: 0.0,
    p50_latency_ms: 0.0,
    p90_latency_ms: 0.0,
    p95_latency_ms: 0.0,
    p99_latency_ms: 0.0,
    dlq_count: 0,
    throughput_series: [],
  };

  const totalSent = m.total_webhooks_24h || 0;
  const isColdStart = m.success_rate_pct === null || m.success_rate_pct === undefined;
  const successfulCount = isColdStart ? 0 : Math.round(totalSent * ((m.success_rate_pct || 0) / 100));
  const failedCount = Math.round(totalSent * ((m.failure_rate_pct || 0) / 100));
  const pendingCount = m.dlq_count || 0;
  const retryRate = `${(m.failure_rate_pct || 0).toFixed(1)}%`;

  const series = useMemo(() => {
    if (Array.isArray(m.throughput_series) && m.throughput_series.length > 0) {
      return m.throughput_series;
    }
    // Generate 24 hourly buckets if empty
    return Array.from({ length: 24 }).map((_, idx) => ({
      label: `${idx}:00`,
      total: 0,
      success: 0,
      failed: 0
    }));
  }, [m.throughput_series]);

  const maxBarTotal = Math.max(...series.map((s) => s.total || (s.success + s.failed) || 1), 1);

  const getSparklinePath = (key = 'total') => {
    if (!series || series.length === 0) return 'M 2 12 L 38 12';
    const vals = series.map(s => s[key] || 0);
    const maxVal = Math.max(...vals, 1);
    return vals.map((v, i) => {
      const x = 2 + (i / (vals.length - 1)) * 36;
      const y = 14 - (v / maxVal) * 10;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      return `${Math.floor(diffSec / 3600)}h ago`;
    } catch {
      return 'Just now';
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-semibold text-zinc-400">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-emerald-500" />
        Loading real-time project metrics...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-sans select-none w-full max-w-7xl mx-auto pb-12">
      
      {/* 🚀 1. Section Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-500" />
            <span>Webhooks Telemetry & Real-Time Analytics</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Live delivery stream & performance insights for project <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{project?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live WebSocket Active
          </span>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition"
            title="Refresh Telemetry Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 📈 2. Real-Time Telemetry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0d1017] transition-all hover:border-indigo-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">TOTAL WEBHOOKS (24H)</span>
            <Zap className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-3 text-2xl font-black font-mono text-zinc-900 dark:text-white">
            {metrics?.total_webhooks_24h ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0d1017] transition-all hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">SUCCESSFUL (200 OK)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-3 text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {metrics?.total_webhooks_24h !== undefined && metrics?.success_rate_pct !== null && metrics?.success_rate_pct !== undefined
              ? Math.round((metrics.total_webhooks_24h * metrics.success_rate_pct) / 100)
              : (metrics?.total_webhooks_24h || 0)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0d1017] transition-all hover:border-rose-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">FAILED (4XX/5XX)</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-3 text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
            {metrics?.total_webhooks_24h !== undefined && metrics?.failure_rate_pct !== undefined
              ? Math.round((metrics.total_webhooks_24h * metrics.failure_rate_pct) / 100)
              : 0}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0d1017] transition-all hover:border-amber-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">PENDING / DLQ QUEUE</span>
            <Inbox className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
              {metrics?.dlq_count ?? 0}
            </span>
            <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
              {metrics?.dlq_count > 0 ? 'Action Needed' : 'Clean'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0d1017] transition-all hover:border-cyan-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">FAILURE / RETRY RATE</span>
            <RotateCcw className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-2xl font-black font-mono text-zinc-900 dark:text-white">
              {metrics?.failure_rate_pct !== undefined ? `${metrics.failure_rate_pct.toFixed(1)}%` : '0.0%'}
            </span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              (metrics?.failure_rate_pct || 0) > 10 
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' 
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
            }`}>
              {(metrics?.failure_rate_pct || 0) > 10 ? 'High' : 'Normal'}
            </span>
          </div>
        </div>
      </div>

      {/* 📊 3. Analytics Main Section (Hourly Activity & Live Queue) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        <div className="lg:col-span-7 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#0d1017]">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                <span>24-Hour Ingress & Delivery Activity</span>
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Success
              </span>
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Failed
              </span>
            </div>
          </div>

          <div className="relative h-64 w-full pt-8 pb-6 flex items-end justify-between gap-1 px-1">
            {hoveredBar !== null && series[hoveredBar] && (
              <div 
                className="absolute top-0 z-30 transform -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/95 p-3 shadow-xl backdrop-blur text-xs space-y-1.5 min-w-[140px] pointer-events-none transition-all duration-150"
                style={{ left: `${((hoveredBar + 0.5) / 24) * 100}%` }}
              >
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Success
                  </span>
                  <span className="font-mono">{series[hoveredBar].success || 0}</span>
                </div>
                <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Failed
                  </span>
                  <span className="font-mono">{series[hoveredBar].failed || 0}</span>
                </div>
                <div className="text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-1 mt-1 text-center font-mono">
                  Time: {series[hoveredBar].label || `${String(hoveredBar).padStart(2, '0')}:00`}
                </div>
              </div>
            )}

            {series.map((bar, idx) => {
              const total = bar.total || (bar.success + bar.failed) || 0;
              const heightPct = total > 0 ? Math.max(15, Math.min(100, (total / maxBarTotal) * 100)) : 8;
              const successRatio = total > 0 ? (bar.success / total) * 100 : 100;
              const failedRatio = total > 0 ? (bar.failed / total) * 100 : 0;

              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredBar(idx)}
                  onMouseLeave={() => setHoveredBar(null)}
                  className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
                >
                  <div 
                    className="w-full max-w-[12px] sm:max-w-[14px] flex flex-col justify-end rounded-t-md overflow-hidden transition-all group-hover:brightness-125 group-hover:scale-y-105"
                    style={{ height: `${heightPct}%` }}
                  >
                    {total === 0 ? (
                      <div className="w-full h-full bg-zinc-200/60 dark:bg-zinc-800/40 rounded-t-md" />
                    ) : (
                      <>
                        {bar.failed > 0 && (
                          <div 
                            className="w-full bg-rose-500 transition-all" 
                            style={{ height: `${failedRatio}%` }} 
                          />
                        )}
                        {bar.success > 0 && (
                          <div 
                            className="w-full bg-emerald-500 transition-all" 
                            style={{ height: `${bar.failed > 0 ? successRatio : 100}%` }} 
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono px-2 border-t border-zinc-200 dark:border-zinc-800 pt-2">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                <span>Recent Live Ingress Queue</span>
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Real-time stream of recent webhooks processed
              </p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('logs')}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <span>View logs</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {recentLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                No recent webhooks queued for this project.
              </div>
            ) : (
              recentLogs.map((log, i) => {
                const status = log.status_code || log.response_code || 200;
                const isSuccess = status >= 200 && status < 300;
                const eventName = log.event_type || log.event?.event_type || 'webhook.received';
                const targetUrl = log.target_url || log.delivery_packet?.target_url || '/v1/webhooks';

                return (
                  <div 
                    key={log.id || i} 
                    className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 dark:border-zinc-800/60 dark:bg-zinc-950/60 text-xs font-mono transition hover:border-indigo-500/30"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                        isSuccess 
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      }`}>
                        {status}
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-sans font-bold truncate">
                        {eventName}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-zinc-400 truncate max-w-[130px] font-sans">
                        {targetUrl.replace(/^https?:\/\/[^\/]+/, '')}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-sans">
                        {formatRelativeTime(log.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* ⚡ 4. Real Latency Percentiles & Setup Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-zinc-200 dark:border-zinc-800/80 pt-8">
        
        {/* Latency Percentiles */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-500" />
              <span>Real Latency Percentiles (End-to-End)</span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Calculated execution durations across delivered webhooks
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 font-mono">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">P50</span>
              <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 mt-1 block">
                {m.p50_latency_ms || m.avg_latency_ms || 0}<span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">P90</span>
              <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 mt-1 block">
                {m.p90_latency_ms || m.avg_latency_ms || 0}<span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">P95</span>
              <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 mt-1 block">
                {m.p95_latency_ms || m.avg_latency_ms || 0}<span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">P99</span>
              <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 mt-1 block">
                {m.p99_latency_ms || m.avg_latency_ms || 0}<span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>
          </div>
        </div>

        {/* Setup Summary */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Project Configuration Summary</span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Active configuration parameters for this workspace
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">Total Webhooks Dispatched</span>
              <span className="text-lg font-black text-zinc-900 dark:text-white mt-1 block">
                {totalSent.toLocaleString()}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">Events Subscribed</span>
              <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
                {project?.event_configs?.length || 0}
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
