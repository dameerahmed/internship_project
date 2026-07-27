import React from 'react';
import { Activity, CheckCircle2, Clock, AlertTriangle, Layers } from 'lucide-react';

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

  const successRateDisplay = m.success_rate_pct !== null && m.success_rate_pct !== undefined 
    ? `${m.success_rate_pct}%` 
    : 'N/A';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 font-sans">
      {/* 1. Total Webhooks Received (24h) */}
      <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md transition hover:border-emerald-500/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-400 uppercase tracking-wider">Total Webhooks (24h)</span>
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500 border border-emerald-500/20">
            <Activity className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            {m.total_webhooks_24h.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">24h Rolling Window</span>
          </div>
        </div>
      </div>

      {/* 2. Success Rate % */}
      <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md transition hover:border-emerald-500/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-400 uppercase tracking-wider">Overall Success Rate</span>
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
            {successRateDisplay}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Failure Rate: <strong className="text-rose-500">{m.failure_rate_pct}%</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Global Avg Latency */}
      <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md transition hover:border-emerald-500/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-400 uppercase tracking-wider">Avg Latency</span>
          <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-500 border border-cyan-500/20">
            <Clock className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-extrabold text-cyan-600 dark:text-cyan-400 tracking-tight">
            {m.avg_latency_ms} <span className="text-sm font-semibold text-zinc-400">ms</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Global endpoint response average
          </div>
        </div>
      </div>

      {/* 4. Active Projects & Total DLQ */}
      <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md transition hover:border-emerald-500/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-400 uppercase tracking-wider">Active Projects & DLQ</span>
          <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500 border border-amber-500/20">
            <Layers className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {m.active_projects_count} <span className="text-xs font-normal text-zinc-400">/ {m.total_projects_count}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Active Company Projects</div>
          </div>
          <div className="text-right">
            <div className={`text-xl font-extrabold tracking-tight ${m.total_dlq_count > 0 ? 'text-amber-500' : 'text-zinc-400'}`}>
              {m.total_dlq_count}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 justify-end">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> DLQ Items
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
