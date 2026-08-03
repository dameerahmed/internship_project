import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layers, ArrowRight, Zap, RefreshCw, Plus, Search, Database, ArrowUpDown, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';

export default function ProjectsGrid({ projects = [], onRefresh, onCreateClick }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');

  // Derive current active sort parameter from URL query string
  const currentSort = searchParams.get('sort') || 'default';

  const handleSortChange = (newSort) => {
    if (newSort === 'default') {
      searchParams.delete('sort');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ sort: newSort });
    }
  };

  // Rely 100% on real backend project metrics
  const enrichedProjects = useMemo(() => {
    return projects.map((p) => {
      const total_webhooks = p.total_webhooks || p.metrics?.total_webhooks_24h || 0;
      const success_rate_pct = p.success_rate_pct ?? p.metrics?.success_rate_pct ?? 100.0;
      const failure_rate_pct = p.failure_rate_pct ?? p.metrics?.failure_rate_pct ?? 0.0;
      const dlq_count = p.dlq_count ?? p.metrics?.dlq_count ?? 0;
      const avg_latency_ms = p.avg_latency_ms ?? p.metrics?.avg_latency_ms ?? 0.0;

      return {
        ...p,
        total_webhooks,
        success_rate_pct: Number(success_rate_pct.toFixed(1)),
        failure_rate_pct: Number(failure_rate_pct.toFixed(1)),
        dlq_count,
        avg_latency_ms: Number(avg_latency_ms.toFixed(2))
      };
    });
  }, [projects]);

  // Filter and Sort projects
  const sortedAndFilteredProjects = useMemo(() => {
    let result = enrichedProjects.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    switch (currentSort) {
      case 'dlq':
      case 'failure':
        result.sort((a, b) => (b.dlq_count - a.dlq_count) || (b.failure_rate_pct - a.failure_rate_pct));
        break;
      case 'latency':
        result.sort((a, b) => b.avg_latency_ms - a.avg_latency_ms);
        break;
      case 'success':
        result.sort((a, b) => b.success_rate_pct - a.success_rate_pct);
        break;
      case 'volume':
        result.sort((a, b) => b.total_webhooks - a.total_webhooks);
        break;
      case 'default':
      default:
        result.sort((a, b) => (b.success_rate_pct - a.success_rate_pct) || (a.avg_latency_ms - b.avg_latency_ms));
        break;
    }

    return result;
  }, [enrichedProjects, searchTerm, currentSort]);

  const handleOpenWorkspace = (e, projectId) => {
    e.stopPropagation();
    navigate(`/dashboard/projects/${projectId}`);
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-cyan-900/30 bg-[#0d151c] p-6 shadow-xl font-sans transition-colors w-full select-none">
      
      {/* 🚀 Header & Search controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-cyan-900/20 pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-400" />
            Company Projects Directory ({projects.length})
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage company projects & inspect metric performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-cyan-900/40 bg-[#070e14] py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-500 transition"
            />
          </div>

          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition active:scale-95 shrink-0 border border-cyan-400/30"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* 📊 Sort Filter Pills Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400 font-semibold font-mono">
          <ArrowUpDown size={14} className="text-cyan-400" />
          <span>Sort By:</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'default', label: 'Best Performing' },
            { id: 'dlq', label: 'Highest DLQ & Failures 🚨' },
            { id: 'latency', label: 'Highest Latency ⏱️' },
            { id: 'volume', label: 'Most Webhooks 📊' },
            { id: 'success', label: 'Highest Success ✅' }
          ].map((st) => {
            const isActive = currentSort === st.id || (st.id === 'dlq' && currentSort === 'failure');
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => handleSortChange(st.id)}
                className={`rounded-xl px-3 py-1.5 font-semibold text-xs transition border ${
                  isActive
                    ? st.id === 'dlq' || st.id === 'failure'
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-sm'
                      : st.id === 'latency'
                      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 shadow-sm'
                      : 'bg-cyan-600 text-white border-cyan-400/40 shadow-md'
                    : 'bg-[#070e14] text-zinc-400 hover:bg-cyan-500/10 hover:text-white border-cyan-900/30'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 🚀 Stacked Vertical List */}
      {sortedAndFilteredProjects.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-cyan-900/30 p-8 text-center bg-[#070e14]">
          <Layers className="h-8 w-8 text-zinc-500 mb-2" />
          <p className="text-sm font-semibold text-zinc-300">No projects found</p>
          <p className="text-xs text-zinc-400 mt-1">Get started by creating your first project.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 w-full">
          {sortedAndFilteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={(e) => handleOpenWorkspace(e, project.id)}
              className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border p-4 shadow-md backdrop-blur-md transition-all duration-200 cursor-pointer ${
                (currentSort === 'failure' || currentSort === 'dlq') && (project.failure_rate_pct > 10 || project.dlq_count > 0)
                  ? 'border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20'
                  : 'border-cyan-900/30 bg-[#111b24] hover:border-cyan-500/50 hover:bg-[#152330]'
              }`}
            >
              {/* Left Column: Project Icon & Details */}
              <div className="flex items-center gap-3.5 min-w-[240px]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-extrabold text-xs shrink-0">
                  {project.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition truncate">
                      {project.name}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      project.is_active !== false
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {project.is_active !== false ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5 max-w-sm">
                    {project.description || 'Active webhook ingress workspace'}
                  </p>
                </div>
              </div>

              {/* Center Column: Key Real Metrics */}
              <div className="flex flex-wrap items-center gap-6 text-xs border-t border-b border-cyan-900/20 md:border-0 py-2 md:py-0">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-400">Total (24h)</span>
                  <span className="font-extrabold text-white font-mono">
                    {project.total_webhooks.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-400">Success Rate</span>
                  <span className={`font-extrabold font-mono ${project.success_rate_pct >= 90 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {project.success_rate_pct}%
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-400">Avg Latency</span>
                  <span className="font-extrabold text-cyan-400 font-mono">
                    {project.avg_latency_ms} ms
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-400">DLQ Items</span>
                  <span className={`font-extrabold font-mono ${project.dlq_count > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {project.dlq_count}
                  </span>
                </div>
              </div>

              {/* Right Column: Open Workspace Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleOpenWorkspace(e, project.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition"
                >
                  <span>Workspace</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
