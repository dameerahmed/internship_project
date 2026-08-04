import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import { useProjectStore } from '@/store/useProjectStore';
import apiClient from '@/api/client';
import { API_ENDPOINTS, WS_ENDPOINTS, withToken } from '@/utils/constants';

/* ─── Skeleton shimmer component ──────────────────────────────────── */
function Skeleton({ className = '', style = {} }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

/* ─── Metric Card with optional sparkline ─────────────────────────── */
function MetricCard({ label, value, sub, color, trend, onClick, sparkPath, loading }) {
  if (loading) {
    return (
      <div className="rounded-eds-md p-4 space-y-3" style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-2 w-36" />
      </div>
    );
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div
      onClick={onClick}
      className={`group rounded-eds-md p-4 space-y-2 transition-all duration-200 ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        background: 'var(--eds-panel)',
        border: '1px solid var(--eds-border)',
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 1px ${color}30`; }}}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.borderColor = 'var(--eds-border)'; e.currentTarget.style.boxShadow = 'none'; }}}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider" style={{ color: 'var(--eds-muted)' }}>
          {label}
          {onClick && <span className="ml-1 opacity-50">↗</span>}
        </span>
        {sparkPath && (
          <svg className="w-12 h-5 shrink-0" fill="none" viewBox="0 0 40 16" stroke={color} strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d={sparkPath} />
          </svg>
        )}
      </div>
      <div className="text-2xl font-extrabold tracking-tight transition-colors" style={{ color: value === 0 && label !== 'Retry Rate' ? 'var(--eds-faint)' : color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && (
        <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--eds-muted)' }}>
          {trend && <TrendIcon size={11} style={{ color }} />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Latency stat box ─────────────────────────────────────────────── */
function LatencyBox({ label, value, loading }) {
  if (loading) {
    return (
      <div className="rounded-eds-md p-4 space-y-2" style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}>
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-6 w-20" />
      </div>
    );
  }
  const ms = Number(value || 0);
  const color = ms < 100 ? 'var(--eds-success)' : ms < 500 ? 'var(--eds-warning)' : 'var(--eds-danger-2)';
  return (
    <div className="rounded-eds-md p-4" style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}>
      <span className="text-[10px] font-bold font-mono uppercase tracking-wider block mb-1" style={{ color: 'var(--eds-muted)' }}>{label}</span>
      <span className="text-lg font-extrabold block" style={{ color: ms > 0 ? color : 'var(--eds-faint)' }}>
        {ms.toFixed(1)} <span className="text-xs font-normal" style={{ color: 'var(--eds-muted)' }}>ms</span>
      </span>
    </div>
  );
}

/* ─── Smooth cubic-bezier spline path generator ──────────────────── */
function cubicBezierPath(points) {
  if (points.length < 2) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cp1x = prev.x + (curr.x - prev.x) * 0.5;
    const cp2x = curr.x - (curr.x - prev.x) * 0.5;
    d += ` C ${cp1x.toFixed(1)} ${prev.y.toFixed(1)}, ${cp2x.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { companyMetrics, setCompanyMetrics, companyMetricsLoading, setCompanyMetricsLoading } = useProjectStore();

  const [recentLogs, setRecentLogs] = useState([]);

  const loadCompanyData = async (silent = false) => {
    if (!silent && !companyMetrics) setCompanyMetricsLoading(true);
    try {
      const { data: metricsData } = await apiClient.get(API_ENDPOINTS.METRICS.COMPANY);
      setCompanyMetrics(metricsData);
      const { data: logsData } = await apiClient.get('/v1/webhooks/logs?limit=8');
      const list = Array.isArray(logsData) ? logsData : (logsData?.logs || []);
      setRecentLogs(list.map((log) => {
        const metadata = log?.metadata || {};
        const status = (log?.status || metadata?.status || '').toUpperCase();
        const level = (log?.level || '').toUpperCase();
        const isFailed = status === 'FAILED' || status === 'REJECTED' || level === 'ERROR';
        let code = log.response_code ?? log.status_code ?? metadata.response_code ?? metadata.status_code;
        if (isFailed) { if (!code || Number(code) === 200) code = 500; }
        else if (!code) { code = 200; }
        return {
          ...log,
          status: status || (isFailed ? 'FAILED' : 'SUCCESS'),
          created_at: log.created_at || log.timestamp || '',
          response_code: Number(code),
          event_type: log.event_type || metadata.event_type || 'webhook.event',
          target_url: log.target_url || log.path || metadata.target_url || '',
        };
      }));
    } catch (err) {
      console.error('Failed to load company metrics:', err);
    } finally {
      if (!silent) setCompanyMetricsLoading(false);
    }
  };

  useEffect(() => {
    loadCompanyData(false);
    let socket = null;
    let reconnectTimer = null;
    let retryCount = 0;

    const connectWs = () => {
      const token = user?.access_token || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))?.access_token : null);
      if (!token) return;
      const wsUrl = withToken(WS_ENDPOINTS.DASHBOARD(), token);
      try {
        socket = new WebSocket(wsUrl);
        socket.onopen = () => { retryCount = 0; };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'heartbeat') return;
            if (payload.type === 'DASHBOARD_UPDATE' || payload.total_webhooks !== undefined || payload.total_webhooks_24h !== undefined) {
              setCompanyMetrics((prev) => {
                const next = {
                  ...(prev || {}),
                  ...payload,
                  total_webhooks_24h:   payload.total_webhooks_24h ?? payload.total_webhooks ?? prev?.total_webhooks_24h ?? 0,
                  success_rate_pct:     payload.success_rate_pct ?? payload.success_rate ?? prev?.success_rate_pct ?? null,
                  failure_rate_pct:     payload.failure_rate_pct ?? payload.failure_rate ?? prev?.failure_rate_pct ?? 0,
                  // FIX: also merge absolute count fields that drive the stat cards
                  success_count:        payload.success_count ?? payload.success_count_24h ?? prev?.success_count ?? 0,
                  failed_count:         payload.failed_count  ?? payload.failed_count_24h  ?? prev?.failed_count  ?? 0,
                  avg_latency_ms:       payload.avg_latency_ms ?? prev?.avg_latency_ms ?? 0,
                  // FIX: merge percentile latencies so the latency stat boxes update in real-time
                  p50_latency_ms:       payload.p50_latency_ms ?? prev?.p50_latency_ms ?? 0,
                  p90_latency_ms:       payload.p90_latency_ms ?? prev?.p90_latency_ms ?? 0,
                  p95_latency_ms:       payload.p95_latency_ms ?? prev?.p95_latency_ms ?? 0,
                  p99_latency_ms:       payload.p99_latency_ms ?? prev?.p99_latency_ms ?? 0,
                  ingress_total_24h:        payload.ingress_total_24h ?? prev?.ingress_total_24h ?? 0,
                  ingress_success_24h:      payload.ingress_success_24h ?? prev?.ingress_success_24h ?? 0,
                  ingress_failed_24h:       payload.ingress_failed_24h ?? prev?.ingress_failed_24h ?? 0,
                  ingress_success_rate_pct: payload.ingress_success_rate_pct ?? prev?.ingress_success_rate_pct ?? null,
                  replay_total_24h:         payload.replay_total_24h ?? prev?.replay_total_24h ?? 0,
                  replay_success_24h:       payload.replay_success_24h ?? prev?.replay_success_24h ?? 0,
                  replay_failed_24h:        payload.replay_failed_24h ?? prev?.replay_failed_24h ?? 0,
                  replay_recovery_rate_pct: payload.replay_recovery_rate_pct ?? prev?.replay_recovery_rate_pct ?? null,
                  retry_efficiency_pct:     payload.retry_efficiency_pct ?? prev?.retry_efficiency_pct ?? 100.0,
                  active_projects_count:  payload.active_projects_count ?? prev?.active_projects_count ?? 0,
                  total_projects_count:   payload.total_projects_count  ?? prev?.total_projects_count  ?? 0,
                  total_dlq_count:      payload.total_dlq_count ?? payload.dlq_count ?? prev?.total_dlq_count ?? 0,
                  throughput_series:    payload.throughput_series ?? prev?.throughput_series ?? [],
                };
                // Bail out early if nothing actually changed (reference equality for unchanged prev)
                if (prev &&
                  prev.total_webhooks_24h === next.total_webhooks_24h &&
                  prev.success_count      === next.success_count &&
                  prev.failed_count       === next.failed_count &&
                  prev.replay_total_24h   === next.replay_total_24h &&
                  prev.avg_latency_ms     === next.avg_latency_ms &&
                  prev.total_dlq_count    === next.total_dlq_count) {
                  return prev;
                }
                return next;
              });
            }
          } catch {}
        };
        socket.onclose = () => {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000) + Math.random() * 1000;
          retryCount++;
          reconnectTimer = setTimeout(connectWs, delay);
        };
        socket.onerror = () => { try { socket.close(); } catch {} };
      } catch {}
    };

    connectWs();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [user?.access_token]);

  const m = companyMetrics || {
    total_webhooks_24h: 0, success_rate_pct: null, failure_rate_pct: 0.0,
    avg_latency_ms: 0.0, p50_latency_ms: 0.0, p90_latency_ms: 0.0,
    p95_latency_ms: 0.0, p99_latency_ms: 0.0,
    active_projects_count: 0, total_projects_count: 0, total_dlq_count: 0,
    throughput_series: [],
    ingress_total_24h: 0, ingress_success_24h: 0, ingress_failed_24h: 0, ingress_success_rate_pct: null,
    replay_total_24h: 0, replay_success_24h: 0, replay_failed_24h: 0, replay_recovery_rate_pct: null,
    retry_efficiency_pct: 100.0,
  };

  const totalSent = m.total_webhooks_24h || 0;
  const isColdStart = m.success_rate_pct === null || m.success_rate_pct === undefined;
  const successRate = isColdStart ? null : m.success_rate_pct;
  const failedCount = m.failed_count_24h ?? Math.round(totalSent * ((m.failure_rate_pct || 0) / 100));
  const successCount = m.success_count_24h ?? (isColdStart ? 0 : Math.round(totalSent * ((successRate || 0) / 100)));
  const dlqCount = m.total_dlq_count || 0;
  const retryRate = `${(m.failure_rate_pct || 0).toFixed(1)}%`;

  const series = Array.isArray(m.throughput_series) ? m.throughput_series : [];

  // Smooth spline chart geometry (cubic bezier)
  const chartGeometry = useMemo(() => {
    const W = 500, H = 110, BASE = 140;
    if (!series.length) {
      return {
        linePath: `M 0 ${BASE} L ${W} ${BASE}`,
        areaPath: `M 0 ${BASE} L ${W} ${BASE} L ${W} 160 L 0 160 Z`,
        peakX: W / 2, peakY: BASE, peakTotal: 0,
      };
    }
    const maxVal = Math.max(...series.map(s => s.total || 0), 1);
    const points = series.map((s, i) => ({
      x: series.length > 1 ? (i / (series.length - 1)) * W : W / 2,
      y: BASE - ((s.total || 0) / maxVal) * H,
      total: s.total || 0,
    }));
    const linePath = cubicBezierPath(points);
    const areaPath = `${linePath} L ${W} 160 L 0 160 Z`;
    const peak = points.reduce((p, c) => c.total > p.total ? c : p, points[0]);
    return { linePath, areaPath, peakX: peak.x, peakY: peak.y, peakTotal: peak.total };
  }, [series]);

  const getSparklinePath = (key = 'total') => {
    if (!series.length) return 'M 2 10 L 38 10';
    const vals = series.map(s => s[key] || 0);
    const maxVal = Math.max(...vals, 1);
    return vals.map((v, i) => {
      const x = 2 + (i / Math.max(vals.length - 1, 1)) * 36;
      const y = 14 - (v / maxVal) * 10;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  const loading = companyMetricsLoading && !companyMetrics;

  /* Donut chart values */
  const successArc = isColdStart ? 0 : Math.min(successRate || 0, 100);
  const failureArc = Math.min(m.failure_rate_pct || 0, 100);

  return (
    <ProtectedLayout>
      <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12 animate-fade-in">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pb-4"
             style={{ borderBottom: '1px solid var(--eds-border)' }}>
          <div>
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--eds-text)' }}>
              Company Webhooks Overview
            </h2>
            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--eds-muted)' }}>
              Live ingress telemetry &amp; organization analytics
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/projects')}
            className="eds-btn-primary shrink-0"
          >
            <span>Manage Projects</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* ── Inline Metric Strip ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 pb-8"
             style={{ borderBottom: '1px solid var(--eds-border)' }}>
          <MetricCard
            label="Total Sent"
            value={totalSent}
            sub="24h rolling window"
            color="var(--eds-accent-2)"
            trend="up"
            sparkPath={getSparklinePath('total')}
            onClick={() => navigate('/dashboard/projects?sort=volume')}
            loading={loading}
          />
          <MetricCard
            label="Successful"
            value={isColdStart ? '—' : successCount}
            sub={isColdStart ? 'No data yet' : `${successRate}% success rate`}
            color="var(--eds-success)"
            trend="up"
            sparkPath={getSparklinePath('success')}
            onClick={() => navigate('/dashboard/projects?sort=success')}
            loading={loading}
          />
          <MetricCard
            label="Failed"
            value={failedCount}
            sub="Delivery failures"
            color={failedCount > 0 ? 'var(--eds-danger-2)' : 'var(--eds-faint)'}
            trend={failedCount > 0 ? 'down' : null}
            sparkPath={getSparklinePath('failed')}
            onClick={() => navigate('/dashboard/projects?sort=failure')}
            loading={loading}
          />
          <MetricCard
            label="Pending DLQ"
            value={dlqCount}
            sub="Dead letter items"
            color={dlqCount > 0 ? 'var(--eds-warning)' : 'var(--eds-faint)'}
            trend={dlqCount > 0 ? 'down' : null}
            sparkPath={getSparklinePath('failed')}
            onClick={() => navigate('/dlq')}
            loading={loading}
          />
          <MetricCard
            label="Retry Rate"
            value={retryRate}
            sub="Failure + retry ratio"
            color={parseFloat(retryRate) > 5 ? 'var(--eds-danger-2)' : 'var(--eds-muted)'}
            trend={parseFloat(retryRate) > 0 ? 'down' : null}
            loading={loading}
          />
        </div>

        {/* ── Charts Row ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

          {/* Throughput Chart — 7 cols */}
          <div
            className="lg:col-span-7 flex flex-col rounded-eds-md p-5 shadow-eds-md space-y-4"
            style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
                  Webhook Delivery Statistics
                </h3>
                <p className="text-[11px] font-medium" style={{ color: 'var(--eds-muted)' }}>
                  Real-time throughput trend (24h window)
                </p>
              </div>
              <select
                className="rounded-eds text-xs px-2.5 py-1.5 font-mono outline-none"
                style={{
                  background: 'var(--eds-surface-2)',
                  border: '1px solid var(--eds-border-2)',
                  color: 'var(--eds-text-2)',
                }}
              >
                <option>Last 24 Hours</option>
              </select>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col gap-3 py-4">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <div className="relative h-52 w-full">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.30" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid lines */}
                  {[40, 80, 120].map((y) => (
                    <line key={y} x1="0" y1={y} x2="500" y2={y}
                          stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  ))}

                  {/* Area fill */}
                  <path d={chartGeometry.areaPath} fill="url(#chart-area-grad)" />

                  {/* Smooth line */}
                  <path
                    d={chartGeometry.linePath}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Peak dot */}
                  {chartGeometry.peakTotal > 0 && (
                    <>
                      <circle cx={chartGeometry.peakX} cy={chartGeometry.peakY} r="6"
                              fill="#6366f1" opacity="0.25" />
                      <circle cx={chartGeometry.peakX} cy={chartGeometry.peakY} r="4"
                              fill="#818cf8" stroke="#06080d" strokeWidth="1.5" />
                    </>
                  )}
                </svg>

                {/* Peak tooltip */}
                {chartGeometry.peakTotal > 0 && (
                  <div
                    className="absolute top-4 -translate-x-1/2 rounded-eds px-2.5 py-1.5 text-[10px] font-bold font-mono shadow-eds flex flex-col items-center pointer-events-none z-10"
                    style={{
                      left: `${(chartGeometry.peakX / 500) * 100}%`,
                      background: 'var(--eds-panel-2)',
                      border: '1px solid var(--eds-border-2)',
                      color: 'var(--eds-accent-2)',
                    }}
                  >
                    <span style={{ color: 'var(--eds-muted)' }} className="text-[9px]">Peak</span>
                    <span>{chartGeometry.peakTotal} events</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] font-mono pt-1"
                 style={{ borderTop: '1px solid var(--eds-border)', color: 'var(--eds-faint)' }}>
              <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>

          {/* Delivery Status Donut — 5 cols */}
          <div
            className="lg:col-span-5 flex flex-col rounded-eds-md p-5 shadow-eds-md space-y-4"
            style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
                  Delivery Status Distribution
                </h3>
                <p className="text-[11px] font-medium" style={{ color: 'var(--eds-muted)' }}>
                  Real-time status breakdown
                </p>
              </div>
              <select
                className="rounded-eds text-xs px-2 py-1.5 font-mono outline-none"
                style={{
                  background: 'var(--eds-surface-2)',
                  border: '1px solid var(--eds-border-2)',
                  color: 'var(--eds-text-2)',
                }}
              >
                <option>All Events</option>
              </select>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Skeleton className="h-36 w-36 rounded-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center relative py-2">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 36 36">
                  {/* Track */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="3.5"
                  />
                  {/* Success segment */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeDasharray={`${isColdStart ? 0 : (successRate || 100)}, 100`}
                    style={{ transition: 'stroke-dasharray 0.8s ease' }}
                  />
                  {/* Failure segment */}
                  {failureArc > 0 && (
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="3.5"
                      strokeDasharray={`${failureArc}, 100`}
                      strokeDashoffset={`-${isColdStart ? 0 : (successRate || 100)}`}
                      style={{ transition: 'stroke-dasharray 0.8s ease' }}
                    />
                  )}
                </svg>

                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: 'var(--eds-muted)' }}>Total</span>
                  <span className="text-xl font-extrabold" style={{ color: 'var(--eds-text)' }}>{totalSent.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-around text-xs font-semibold pt-2"
                 style={{ borderTop: '1px solid var(--eds-border)' }}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                <div className="flex flex-col">
                  <span style={{ color: 'var(--eds-text-2)' }}>Successful</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--eds-muted)' }}>
                    {successCount.toLocaleString()} ({isColdStart ? 'N/A' : `${successRate}%`})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
                <div className="flex flex-col">
                  <span style={{ color: 'var(--eds-text-2)' }}>Failed / DLQ</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--eds-muted)' }}>
                    {failedCount} ({m.failure_rate_pct || 0}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Delivery Provenance & Replay Efficiency Matrix ───────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
                Independent Telemetry &amp; Recovery Efficiency Matrix
              </h3>
              <p className="text-[11px] font-medium" style={{ color: 'var(--eds-muted)' }}>
                Isolated tracking for primary ingress vs DLQ replay recovery
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono"
              style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
              LIVE PROVENANCE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Primary Ingress Deliveries */}
            <div className="rounded-eds-md p-4 flex flex-col justify-between space-y-3"
                 style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">Primary Ingress</span>
                <span className="h-2 w-2 rounded-full bg-sky-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold" style={{ color: 'var(--eds-text)' }}>
                  {(m.ingress_total_24h || 0).toLocaleString()}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {m.ingress_success_rate_pct !== null && m.ingress_success_rate_pct !== undefined
                    ? `${m.ingress_success_rate_pct}% success`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono" style={{ color: 'var(--eds-muted)' }}>
                <span>✓ {(m.ingress_success_24h || 0).toLocaleString()} success</span>
                <span>✗ {(m.ingress_failed_24h || 0).toLocaleString()} failed</span>
              </div>
            </div>

            {/* DLQ Replay Recovery */}
            <div className="rounded-eds-md p-4 flex flex-col justify-between space-y-3"
                 style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">DLQ Replay Recovery</span>
                <span className="h-2 w-2 rounded-full bg-purple-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold" style={{ color: 'var(--eds-text)' }}>
                  {(m.replay_total_24h || 0).toLocaleString()}
                </span>
                <span className="text-xs font-mono font-bold text-purple-400">
                  {m.replay_recovery_rate_pct !== null && m.replay_recovery_rate_pct !== undefined
                    ? `${m.replay_recovery_rate_pct}% recovered`
                    : 'No replays'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono" style={{ color: 'var(--eds-muted)' }}>
                <span>✓ {(m.replay_success_24h || 0).toLocaleString()} recovered</span>
                <span>✗ {(m.replay_failed_24h || 0).toLocaleString()} re-failed</span>
              </div>
            </div>

            {/* Overall System Efficiency */}
            <div className="rounded-eds-md p-4 flex flex-col justify-between space-y-3"
                 style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">System Efficiency Matrix</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold" style={{ color: 'var(--eds-text)' }}>
                  {m.retry_efficiency_pct !== undefined ? `${m.retry_efficiency_pct}%` : '100%'}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Overall Efficiency
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono" style={{ color: 'var(--eds-muted)' }}>
                <span>Ingress + Replay Combined</span>
                <span>Zero Data Lag</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Latency Percentiles ──────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold" style={{ color: 'var(--eds-text)' }}>
            Latency Percentiles
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <LatencyBox label="P50" value={m.p50_latency_ms} loading={loading} />
            <LatencyBox label="P90" value={m.p90_latency_ms} loading={loading} />
            <LatencyBox label="P95" value={m.p95_latency_ms} loading={loading} />
            <LatencyBox label="P99" value={m.p99_latency_ms} loading={loading} />
          </div>
        </div>

      </div>
    </ProtectedLayout>
  );
}
