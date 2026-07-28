import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, ArrowUpRight, Activity, Clock, Layers } from 'lucide-react';
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
      // Fetch real project metrics and recent project logs in parallel
      const [metricsRes, logsRes] = await Promise.allSettled([
        apiClient.get(API_ENDPOINTS.METRICS.PROJECT(project.id)),
        apiClient.get(`/v1/projects/${project.id}/logs?limit=6`)
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
                dlq_count: payload.dlq_count ?? payload.total_dlq_count ?? prev?.dlq_count ?? 0,
                throughput_series: payload.throughput_series ?? prev?.throughput_series ?? [],
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
                return [payload, ...prev].slice(0, 6);
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
  const retryRate = `${(m.failure_rate_pct || 0).toFixed(0)}%`;

  const series = Array.isArray(m.throughput_series) ? m.throughput_series : [];
  const maxBarTotal = Math.max(...series.map((s) => s.total || 1), 1);

  // Dynamic Micro Sparkline Generator
  const getSparklinePath = (key = 'total') => {
    if (!series || series.length === 0) return 'M 2 10 L 38 10';
    const vals = series.map(s => s[key] || 0);
    const maxVal = Math.max(...vals, 1);
    return vals.map((v, i) => {
      const x = 2 + (i / (vals.length - 1)) * 36;
      const y = 14 - (v / maxVal) * 10;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  if (loading && !metrics) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-semibold text-zinc-400">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-emerald-500" />
        Loading project workspace metrics...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 font-sans w-full max-w-7xl mx-auto text-zinc-900 dark:text-zinc-100 pb-8 select-none">
      
      {/* 👑 1. Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
          Webhooks Telemetry & Analytics
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Last 24 hours activity for <span className="font-semibold text-zinc-800 dark:text-zinc-200">{project?.name || 'Project'}</span>
        </p>
      </div>

      {/* 📈 2. Resend-Style Micro Inline Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-8">
        
        {/* Metric 1: Total Webhooks */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
            Total Webhooks Sent
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
              {totalSent.toLocaleString()}
            </span>
            <svg className="w-12 h-5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('total')} />
            </svg>
          </div>
        </div>

        {/* Metric 2: Successful */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
            Successful
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
              {isColdStart ? '0' : successfulCount.toLocaleString()}
            </span>
            <svg className="w-12 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('success')} />
            </svg>
          </div>
        </div>

        {/* Metric 3: Failed */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
            Failed
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
              {failedCount}
            </span>
            <svg className="w-12 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
            </svg>
          </div>
        </div>

        {/* Metric 4: Pending */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
            Pending
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
              {pendingCount}
            </span>
            <svg className="w-12 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
            </svg>
          </div>
        </div>

        {/* Metric 5: Retry Rate */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
            Retry Rate
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
              {retryRate}
            </span>
            <svg className="w-12 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
            </svg>
          </div>
        </div>

      </div>

      {/* 📊 3. Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (7 Cols): Hourly Activity Stacked Bar Chart */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
              Hourly Activity
            </h2>
          </div>

          <div className="relative h-60 w-full pt-8 pb-6 border-b border-zinc-200 dark:border-zinc-800 flex items-end justify-between gap-1.5 px-2">
            
            {/* Interactive Tooltip Card */}
            {hoveredBar !== null && series[hoveredBar] && (
              <div 
                className="absolute top-0 z-30 transform -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-900/95 p-3 shadow-xl backdrop-blur text-xs space-y-1.5 min-w-[140px] pointer-events-none transition-all duration-150"
                style={{ left: `${((hoveredBar + 0.5) / series.length) * 100}%` }}
              >
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Successful
                  </span>
                  <span>{series[hoveredBar].success || 0}</span>
                </div>

                <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Failed
                  </span>
                  <span>{series[hoveredBar].failed || 0}</span>
                </div>

                <div className="text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-1 mt-1 text-center font-mono">
                  {series[hoveredBar].label || `Bucket ${hoveredBar}`}
                </div>
              </div>
            )}

            {/* Stacked Bars */}
            {series.map((bar, idx) => {
              const total = bar.total || (bar.success + bar.failed) || 1;
              const heightPct = Math.max(8, Math.min(100, (total / maxBarTotal) * 100));

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
                    className="w-full flex flex-col justify-end rounded-t overflow-hidden transition-all group-hover:opacity-80"
                    style={{ height: `${heightPct}%` }}
                  >
                    {/* Failed segment (top) */}
                    {bar.failed > 0 && (
                      <div 
                        className="w-full bg-rose-500" 
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

          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono px-1">
            <span>0:00</span>
            <span>6:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* Right Column (5 Cols): Recent Queue Table */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
              Recent Queue
            </h2>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('logs')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View all logs
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {recentLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                No recent webhooks queued for this project.
              </div>
            ) : (
              recentLogs.map((log, i) => {
                const status = log.status_code || log.response_code || 200;
                const isSuccess = status >= 200 && status < 300;
                const eventName = log.event_type || log.delivery_packet?.event_type || 'webhook.event';
                const targetUrl = log.target_url || log.delivery_packet?.target_url || '/v1/webhooks';

                return (
                  <div 
                    key={log.id || i} 
                    className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800/60 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                        isSuccess 
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      }`}>
                        {status}
                      </span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-sans font-medium truncate">
                        {eventName}
                      </span>
                    </div>

                    <span className="text-[11px] text-zinc-400 truncate max-w-[150px] font-sans">
                      {targetUrl}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* ⚡ 4. Latency Percentiles + Setup Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        
        {/* Latency Percentiles */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Latency Percentiles
          </h3>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">P50</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white mt-1 block">
                {m.p50_latency_ms || 0.0} <span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">P90</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white mt-1 block">
                {m.p90_latency_ms || 0.0} <span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">P95</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white mt-1 block">
                {m.p95_latency_ms || 0.0} <span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">P99</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white mt-1 block">
                {m.p99_latency_ms || 0.0} <span className="text-xs font-normal text-zinc-400">ms</span>
              </span>
            </div>
          </div>
        </div>

        {/* Setup Summary */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Setup Summary
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Total Webhooks Sent</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white mt-1 block">
                {totalSent.toLocaleString()}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Events Subscribed</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white mt-1 block">
                {project?.event_configs?.length || 0}
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
