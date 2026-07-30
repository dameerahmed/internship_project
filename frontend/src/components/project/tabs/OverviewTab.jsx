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
  }, [project?.id, user]);

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
    <div className="flex flex-col gap-8 font-sans w-full max-w-7xl mx-auto text-zinc-900 dark:text-zinc-100 pb-12 select-none">
      
      {/* 👑 1. Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-indigo-500" />
            <span>Webhooks Telemetry & Real-Time Analytics</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Live delivery stream & performance insights for project <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{project?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live WebSocket Active</span>
          </span>

          <button
            type="button"
            onClick={() => loadData(true)}
            className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition"
            title="Refresh Metrics"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 📊 2. High-Impact Glassmorphic KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        
        {/* Metric 1: Total Webhooks */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col justify-between transition hover:border-indigo-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Total Webhooks (24h)
            </span>
            <Zap className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
              {totalSent.toLocaleString()}
            </span>
            <svg className="w-10 h-5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('total')} />
            </svg>
          </div>
        </div>

        {/* Metric 2: Successful */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col justify-between transition hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Successful (200 OK)
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {isColdStart ? '0' : successfulCount.toLocaleString()}
            </span>
            <svg className="w-10 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('success')} />
            </svg>
          </div>
        </div>

        {/* Metric 3: Failed */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col justify-between transition hover:border-rose-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Failed (4xx/5xx)
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight">
              {failedCount}
            </span>
            <svg className="w-10 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
            </svg>
          </div>
        </div>

        {/* Metric 4: Pending / DLQ */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col justify-between transition hover:border-amber-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Pending / DLQ Queue
            </span>
            <Inbox className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tracking-tight">
              {pendingCount}
            </span>
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
              {pendingCount > 0 ? 'Action Needed' : 'Clean'}
            </span>
          </div>
        </div>

        {/* Metric 5: Retry Rate */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col justify-between transition hover:border-cyan-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Failure / Retry Rate
            </span>
            <RotateCcw className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
              {retryRate}
            </span>
            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
              parseFloat(retryRate) > 10 
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
            }`}>
              {parseFloat(retryRate) > 10 ? 'High' : 'Normal'}
            </span>
          </div>
        </div>

      </div>

      {/* 📊 3. Analytics Main Section (Hourly Activity & Live Queue) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (7 Cols): Hourly Activity Stacked Bar Chart */}
        <div className="lg:col-span-7 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                <span>24-Hour Ingress & Delivery Activity</span>
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Hourly breakdown of successful vs failed webhook deliveries
              </p>
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

          {/* Interactive Chart Container */}
          <div className="relative h-64 w-full pt-8 pb-6 flex items-end justify-between gap-1.5 px-2">
            
            {/* Interactive Tooltip Card */}
            {hoveredBar !== null && series[hoveredBar] && (
              <div 
                className="absolute top-0 z-30 transform -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/95 p-3 shadow-xl backdrop-blur text-xs space-y-1.5 min-w-[140px] pointer-events-none transition-all duration-150"
                style={{ left: `${((hoveredBar + 0.5) / series.length) * 100}%` }}
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
                  Bucket: {series[hoveredBar].label || `Bucket ${hoveredBar}`}
                </div>
              </div>
            )}

            {/* Stacked Bars */}
            {series.map((bar, idx) => {
              const total = bar.total || (bar.success + bar.failed) || 0;
              const heightPct = total > 0 ? Math.max(12, Math.min(100, (total / maxBarTotal) * 100)) : 6;

              const successRatio = total > 0 ? (bar.success / total) * 100 : 100;
              const failedRatio = total > 0 ? (bar.failed / total) * 100 : 0;

              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredBar(idx)}
                  onMouseLeave={() => setHoveredBar(null)}
                  className="flex-1 flex flex-col justify-end h-full cursor-pointer group px-0.5"
                >
                  <div 
                    className="w-full flex flex-col justify-end rounded-t-lg overflow-hidden transition-all group-hover:brightness-125"
                    style={{ height: `${heightPct}%` }}
                  >
                    {/* Failed segment (top) */}
                    {bar.failed > 0 && (
                      <div 
                        className="w-full bg-rose-500 transition" 
                        style={{ height: `${failedRatio}%` }} 
                      />
                    )}
                    {/* Successful segment (bottom) */}
                    <div 
                      className="w-full bg-emerald-500/80 group-hover:bg-emerald-500 transition" 
                      style={{ height: `${successRatio}%` }} 
                    />
                  </div>
                </div>
              );
            })}

          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono px-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-2">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* Right Column (5 Cols): Recent Live Queue Table */}
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
