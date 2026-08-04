import React from 'react';
import { BarChart3, CheckCircle2, Clock, Layers, AlertTriangle } from 'lucide-react';

export default function CompanyMetricsCards({ metrics }) {
  const m = metrics || {
    total_webhooks_24h: 0,
    success_rate_pct: null,
    failure_rate_pct: 0.0,
    avg_latency_ms: 0.0,
    active_projects_count: 0,
    total_projects_count: 0,
    total_dlq_count: 0,
  };

  const isColdStart = m.success_rate_pct === null || m.success_rate_pct === undefined;
  const successRateDisplay = isColdStart ? 'N/A' : `${m.success_rate_pct}%`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 font-display">
      {/* 1. Total Webhooks Received (24h) */}
      <div
        className="flex flex-col justify-between rounded-eds-md p-5 shadow-eds transition-all duration-150 hover:border-eds-accent-ring"
        style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--eds-muted)' }}>
            Total Webhooks (24h)
          </span>
          <div className="rounded-eds p-2 border" style={{ background: 'var(--eds-accent-dim)', borderColor: 'var(--eds-accent-ring)', color: 'var(--eds-accent-2)' }}>
            <BarChart3 size={18} />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
            {(m.total_webhooks_24h || 0).toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] font-medium" style={{ color: 'var(--eds-accent-2)' }}>
            24h Rolling Ingress
          </div>
        </div>
      </div>

      {/* 2. Success Rate % */}
      <div
        className="flex flex-col justify-between rounded-eds-md p-5 shadow-eds transition-all duration-150 hover:border-eds-success"
        style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--eds-muted)' }}>
            Overall Success Rate
          </span>
          <div className="rounded-eds p-2 border" style={{ background: 'var(--eds-success-dim)', borderColor: 'rgba(16,185,129,0.25)', color: 'var(--eds-success)' }}>
            <CheckCircle2 size={18} />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--eds-success)' }}>
            {successRateDisplay}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--eds-muted)' }}>
            <span>Failure Rate: <strong style={{ color: 'var(--eds-danger-2)' }}>{m.failure_rate_pct || 0}%</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Global Avg Latency */}
      <div
        className="flex flex-col justify-between rounded-eds-md p-5 shadow-eds transition-all duration-150 hover:border-eds-info"
        style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--eds-muted)' }}>
            Avg Latency
          </span>
          <div className="rounded-eds p-2 border" style={{ background: 'var(--eds-info-dim)', borderColor: 'rgba(56,189,248,0.25)', color: 'var(--eds-info)' }}>
            <Clock size={18} />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--eds-info)' }}>
            {m.avg_latency_ms || 0} <span className="text-xs font-normal" style={{ color: 'var(--eds-muted)' }}>ms</span>
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'var(--eds-muted)' }}>
            Global endpoint response average
          </div>
        </div>
      </div>

      {/* 4. Active Projects & Total DLQ */}
      <div
        className="flex flex-col justify-between rounded-eds-md p-5 shadow-eds transition-all duration-150 hover:border-eds-warning"
        style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--eds-muted)' }}>
            Active Projects &amp; DLQ
          </span>
          <div className="rounded-eds p-2 border" style={{ background: 'var(--eds-warning-dim)', borderColor: 'rgba(245,158,11,0.25)', color: 'var(--eds-warning)' }}>
            <Layers size={18} />
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
              {m.active_projects_count || 0} <span className="text-xs font-normal" style={{ color: 'var(--eds-muted)' }}>/ {m.total_projects_count || 0}</span>
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--eds-muted)' }}>Active Workspace Nodes</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold tracking-tight" style={{ color: (m.total_dlq_count || 0) > 0 ? 'var(--eds-warning)' : 'var(--eds-muted)' }}>
              {m.total_dlq_count || 0}
            </div>
            <div className="mt-1 text-[11px] flex items-center gap-1 justify-end" style={{ color: 'var(--eds-muted)' }}>
              <AlertTriangle size={11} style={{ color: 'var(--eds-warning)' }} /> DLQ Items
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
