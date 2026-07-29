import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  RefreshCw, 
  ArrowRight,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileText
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import { useProjectStore } from '@/store/useProjectStore';
import apiClient from '@/api/client';
import { API_ENDPOINTS, WS_ENDPOINTS, withToken } from '@/utils/constants';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    companyMetrics, 
    setCompanyMetrics, 
    companyMetricsLoading, 
    setCompanyMetricsLoading 
  } = useProjectStore();

  const [recentLogs, setRecentLogs] = useState([]);
  const [topEvents, setTopEvents] = useState([]);

  const loadCompanyData = async (silent = false) => {
    if (!silent && !companyMetrics) {
      setCompanyMetricsLoading(true);
    }
    try {
      // 1. Fetch company aggregated metrics
      const { data: metricsData } = await apiClient.get(API_ENDPOINTS.METRICS.COMPANY);
      setCompanyMetrics(metricsData);

      // 2. Fetch recent webhook logs
      const { data: logsData } = await apiClient.get('/v1/webhooks/logs?limit=8');
      const list = Array.isArray(logsData) ? logsData : (logsData?.logs || []);
      setRecentLogs(list.map((log) => ({
        ...log,
        created_at: log.created_at || log.timestamp || '',
        response_code: log.response_code ?? log.status_code ?? 200,
        status_code: log.response_code ?? log.status_code ?? 200,
        event_type: log.event_type || log.metadata?.event_type || log.delivery_packet?.event_type || 'webhook.event',
        target_url: log.target_url || log.path || log.metadata?.target_url || log.delivery_packet?.target_url || '',
        http_method: log.http_method || log.metadata?.http_method || log.delivery_packet?.http_method || 'POST',
      })));

      // 3. Compute top event frequencies
      const counts = {};
      list.forEach((l) => {
        const ev = l.event_type || l.delivery_packet?.event_type || 'webhook.event';
        counts[ev] = (counts[ev] || 0) + 1;
      });
      const sortedEvents = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      setTopEvents(sortedEvents);

    } catch (err) {
      console.error('Failed to load company metrics:', err);
    } finally {
      if (!silent) {
        setCompanyMetricsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadCompanyData(false);

    // Establish WebSocket stream to /ws/dashboard with auto-reconnect
    let socket = null;
    let reconnectTimer = null;
    let retryCount = 0;

    const connectWs = () => {
      const token = user?.access_token || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))?.access_token : null);
      if (!token) return;

      const wsUrl = withToken(WS_ENDPOINTS.DASHBOARD(), token);
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          retryCount = 0;
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'DASHBOARD_UPDATE' || payload.total_webhooks !== undefined || payload.total_webhooks_24h !== undefined) {
              setCompanyMetrics((prev) => ({
                ...(prev || {}),
                ...payload,
                total_webhooks_24h: payload.total_webhooks_24h ?? payload.total_webhooks ?? prev?.total_webhooks_24h ?? 0,
                success_rate_pct: payload.success_rate_pct ?? payload.success_rate ?? prev?.success_rate_pct ?? null,
                failure_rate_pct: payload.failure_rate_pct ?? payload.failure_rate ?? prev?.failure_rate_pct ?? 0,
                avg_latency_ms: payload.avg_latency_ms ?? prev?.avg_latency_ms ?? 0,
                active_projects_count: payload.active_projects_count ?? prev?.active_projects_count ?? 0,
                total_projects_count: payload.total_projects_count ?? prev?.total_projects_count ?? 0,
                total_dlq_count: payload.total_dlq_count ?? payload.dlq_count ?? prev?.total_dlq_count ?? 0,
                throughput_series: payload.throughput_series ?? prev?.throughput_series ?? [],
              }));
            }
          } catch (err) {
            console.warn('Dashboard WS message parse error:', err);
          }
        };

        socket.onclose = () => {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount++;
          reconnectTimer = setTimeout(connectWs, delay);
        };

        socket.onerror = () => {
          try { socket.close(); } catch {}
        };
      } catch (err) {
        console.warn('WebSocket connection error:', err);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [user]);

  const m = companyMetrics || {
    total_webhooks_24h: 0,
    success_rate_pct: null,
    failure_rate_pct: 0.0,
    avg_latency_ms: 0.0,
    p50_latency_ms: 0.0,
    p90_latency_ms: 0.0,
    p95_latency_ms: 0.0,
    p99_latency_ms: 0.0,
    active_projects_count: 0,
    total_projects_count: 0,
    total_dlq_count: 0,
    throughput_series: []
  };

  const totalSent = m.total_webhooks_24h || 0;
  const isColdStart = m.success_rate_pct === null || m.success_rate_pct === undefined;
  const successfulCount = isColdStart ? 0 : Math.round(totalSent * ((m.success_rate_pct || 0) / 100));
  const failedCount = Math.round(totalSent * ((m.failure_rate_pct || 0) / 100));
  const pendingCount = m.total_dlq_count || 0;
  const retryRate = `${(m.failure_rate_pct || 0).toFixed(0)}%`;

  const series = Array.isArray(m.throughput_series) ? m.throughput_series : [];

  // Dynamic SVG Path Generator for 24h Spline Area Chart
  const chartGeometry = useMemo(() => {
    const width = 500;
    const height = 110;
    const baseLine = 140;

    if (!series || series.length === 0) {
      return {
        linePath: `M 0 ${baseLine} L ${width} ${baseLine}`,
        areaPath: `M 0 ${baseLine} L ${width} ${baseLine} L ${width} 160 L 0 160 Z`,
        peakX: width / 2,
        peakY: baseLine,
        peakTotal: 0
      };
    }

    const maxVal = Math.max(...series.map(s => s.total || 0), 1);
    const points = series.map((s, i) => {
      const x = series.length > 1 ? (i / (series.length - 1)) * width : width / 2;
      const y = baseLine - ((s.total || 0) / maxVal) * height;
      return { x, y, total: s.total || 0 };
    });

    const linePath = points.reduce((acc, p, i) => i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
    const areaPath = `${linePath} L ${width} 160 L 0 160 Z`;
    
    let peak = points[0];
    points.forEach(p => { if (p.total > (peak.total || 0)) peak = p; });

    return { linePath, areaPath, peakX: peak.x, peakY: peak.y, peakTotal: peak.total };
  }, [series]);

  // Dynamic Micro Sparkline Path Generator
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

  return (
    <ProtectedLayout>
      <div className="flex flex-col gap-8 font-sans w-full max-w-7xl mx-auto text-zinc-900 dark:text-zinc-100 pb-12 select-none">
        
        {/* 🌟 1. Top Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Company Webhooks Overview
            </h1>
            <p className="text-xs text-zinc-400 font-normal mt-0.5">
              Live ingress telemetry & organization analytics
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard/projects')}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
          >
            <span>Manage Projects</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* 📈 2. Resend-Style Micro Inline Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-8">
          
          {/* Metric 1: Total Webhooks Sent */}
          <div 
            onClick={() => navigate('/dashboard/projects?sort=volume')}
            title="Click to view projects sorted by webhook volume"
            className="space-y-1 p-2 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition group select-none"
          >
            <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-indigo-500 block uppercase tracking-wider transition">
              Total Webhooks Sent ↗
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                {totalSent.toLocaleString()}
              </span>
              <svg className="w-12 h-5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('total')} />
              </svg>
            </div>
          </div>

          {/* Metric 2: Successful */}
          <div 
            onClick={() => navigate('/dashboard/projects?sort=success')}
            title="Click to view projects sorted by highest success rate"
            className="space-y-1 p-2 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition group select-none"
          >
            <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-emerald-500 block uppercase tracking-wider transition">
              Successful ↗
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                {isColdStart ? '0' : successfulCount.toLocaleString()}
              </span>
              <svg className="w-12 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('success')} />
              </svg>
            </div>
          </div>

          {/* Metric 3: Failed */}
          <div 
            onClick={() => navigate('/dashboard/projects?sort=failure')}
            title="Click to view projects sorted by highest failure rate"
            className="space-y-1 p-2 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition group select-none"
          >
            <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-rose-500 block uppercase tracking-wider transition">
              Failed ↗
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 transition">
                {failedCount}
              </span>
              <svg className="w-12 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
              </svg>
            </div>
          </div>

          {/* Metric 4: Pending / DLQ */}
          <div 
            onClick={() => navigate('/dashboard/projects?sort=dlq')}
            title="Click to view projects sorted by DLQ items"
            className="space-y-1 p-2 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition group select-none"
          >
            <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-amber-500 block uppercase tracking-wider transition">
              Pending DLQ ↗
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                {pendingCount}
              </span>
              <svg className="w-12 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
              </svg>
            </div>
          </div>

          {/* Metric 5: Retry / Failure Rate */}
          <div 
            onClick={() => navigate('/dashboard/projects?sort=failure')}
            title="Click to view projects sorted by failure & retry rate"
            className="space-y-1 p-2 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition group select-none"
          >
            <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-rose-500 block uppercase tracking-wider transition">
              Retry Rate ↗
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition">
                {retryRate}
              </span>
              <svg className="w-12 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={getSparklinePath('failed')} />
              </svg>
            </div>
          </div>

        </div>

        {/* 📊 3. Side-by-Side Analytics Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Analytics Card (7 Cols): Webhook Delivery Statistics */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-[#0c0e17]/90 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight">
                  Webhook Delivery Statistics
                </h2>
                <p className="text-[11px] text-zinc-400 font-medium">Real-time throughput trend (24h)</p>
              </div>

              <select className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-xs px-2.5 py-1 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none">
                <option>Last 24 Hours</option>
              </select>
            </div>

            {/* Smooth Dynamic Spline Area SVG Chart */}
            <div className="relative h-56 w-full pt-4 pb-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="splineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="0" y1="40" x2="500" y2="40" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800/50" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="500" y2="80" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800/50" strokeDasharray="3 3" />
                <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800/50" strokeDasharray="3 3" />

                {/* Dynamic Area Path */}
                <path d={chartGeometry.areaPath} fill="url(#splineGradient)" />

                {/* Dynamic Stroke Line */}
                <path
                  d={chartGeometry.linePath}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Peak Highlight Circle */}
                <circle cx={chartGeometry.peakX} cy={chartGeometry.peakY} r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
              </svg>

              {/* Peak Tooltip Pill */}
              <div 
                style={{ left: `${(chartGeometry.peakX / 500) * 100}%` }}
                className="absolute top-6 -translate-x-1/2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-2.5 py-1 text-[11px] font-bold shadow-lg flex flex-col items-center pointer-events-none z-10"
              >
                <span className="text-[10px] text-zinc-400 font-mono">Peak Traffic</span>
                <span>{chartGeometry.peakTotal > 0 ? `${chartGeometry.peakTotal} Webhooks` : 'Real-time Ingress'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <span>0:00</span>
              <span>6:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>

          {/* Right Analytics Card (5 Cols): Delivery Status Breakdown */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-[#0c0e17]/90 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight">
                  Delivery Status Distribution
                </h2>
                <p className="text-[11px] text-zinc-400 font-medium">Real-time status ratio</p>
              </div>

              <select className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-xs px-2 py-1 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none">
                <option>All Events</option>
              </select>
            </div>

            {/* Donut Chart View */}
            <div className="flex items-center justify-center relative py-2">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 36 36">
                {/* Background Ring */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  className="text-zinc-100 dark:text-zinc-800/80"
                  strokeWidth="3.8"
                />

                {/* Successful Segment (Emerald) */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.8"
                  strokeDasharray={`${isColdStart ? 0 : (m.success_rate_pct || 100)}, 100`}
                />

                {/* Failed Segment (Rose) */}
                {m.failure_rate_pct > 0 && (
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="3.8"
                    strokeDasharray={`${m.failure_rate_pct}, 100`}
                    strokeDashoffset={`-${isColdStart ? 0 : (m.success_rate_pct || 100)}`}
                  />
                )}
              </svg>

              {/* Center Donut Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Total</span>
                <span className="text-lg font-extrabold text-zinc-900 dark:text-white">
                  {totalSent}
                </span>
              </div>
            </div>

            {/* Donut Legend Items */}
            <div className="flex items-center justify-around text-xs font-semibold pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-zinc-800 dark:text-zinc-200">Successful</span>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {successfulCount} ({isColdStart ? 'N/A' : `${m.success_rate_pct}%`})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-zinc-800 dark:text-zinc-200">Failed / DLQ</span>
                  <span className="text-[11px] text-zinc-400 font-mono">{failedCount} ({m.failure_rate_pct}%)</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* ⚡ 4. Latency Percentiles */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
          
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Latency Percentiles
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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

        </div>

      </div>
    </ProtectedLayout>
  );
}
