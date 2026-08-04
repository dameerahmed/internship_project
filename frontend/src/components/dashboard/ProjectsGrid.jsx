import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FolderGit2, ArrowRight, Plus, Search, ArrowUpDown, Layers } from 'lucide-react';

export default function ProjectsGrid({ projects = [], onRefresh, onCreateClick }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');

  const currentSort = searchParams.get('sort') || 'default';

  const handleSortChange = (newSort) => {
    if (newSort === 'default') {
      searchParams.delete('sort');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ sort: newSort });
    }
  };

  const enrichedProjects = useMemo(() => {
    return projects.map((p) => {
      const total_webhooks = p.total_webhooks || p.metrics?.total_webhooks_24h || p.total_webhooks_24h || 0;
      const success_rate_pct = p.success_rate_pct ?? p.metrics?.success_rate_pct ?? 100.0;
      const failure_rate_pct = p.failure_rate_pct ?? p.metrics?.failure_rate_pct ?? 0.0;
      const dlq_count = p.dlq_count ?? p.metrics?.dlq_count ?? p.total_dlq_count ?? 0;
      const avg_latency_ms = p.avg_latency_ms ?? p.metrics?.avg_latency_ms ?? 0.0;

      return {
        ...p,
        total_webhooks,
        success_rate_pct: Number(Number(success_rate_pct).toFixed(1)),
        failure_rate_pct: Number(Number(failure_rate_pct).toFixed(1)),
        dlq_count,
        avg_latency_ms: Number(Number(avg_latency_ms).toFixed(2))
      };
    });
  }, [projects]);

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
    <div
      className="flex flex-col gap-5 rounded-eds-md p-6 shadow-eds-md font-display transition-colors w-full select-none"
      style={{ background: 'var(--eds-panel)', border: '1px solid var(--eds-border)' }}
    >
      {/* Header & Search Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4"
           style={{ borderBottom: '1px solid var(--eds-border)' }}>
        <div>
          <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2"
              style={{ color: 'var(--eds-text)' }}>
            <FolderGit2 size={18} style={{ color: 'var(--eds-accent-2)' }} />
            Company Projects Directory ({projects.length})
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--eds-muted)' }}>
            Manage workspace projects &amp; inspect ingress metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: 'var(--eds-muted)' }} />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="eds-input pl-8 py-1.5"
            />
          </div>

          <button
            type="button"
            onClick={onCreateClick}
            className="eds-btn-primary shrink-0 py-1.5"
          >
            <Plus size={14} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold" style={{ color: 'var(--eds-muted)' }}>
          <ArrowUpDown size={13} style={{ color: 'var(--eds-accent-2)' }} />
          <span>Sort By:</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'default', label: 'Best Performing' },
            { id: 'dlq', label: 'DLQ & Failures 🚨' },
            { id: 'latency', label: 'Highest Latency ⏱️' },
            { id: 'volume', label: 'Webhook Volume 📊' },
            { id: 'success', label: 'Highest Success ✅' }
          ].map((st) => {
            const isActive = currentSort === st.id || (st.id === 'dlq' && currentSort === 'failure');
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => handleSortChange(st.id)}
                className="rounded-eds px-3 py-1 text-xs font-semibold transition-all duration-150 font-mono"
                style={
                  isActive
                    ? {
                        background: 'var(--eds-accent-dim)',
                        border: '1px solid var(--eds-accent-ring)',
                        color: 'var(--eds-accent-2)',
                      }
                    : {
                        background: 'var(--eds-surface-2)',
                        border: '1px solid var(--eds-border)',
                        color: 'var(--eds-muted)',
                      }
                }
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Projects List */}
      {sortedAndFilteredProjects.length === 0 ? (
        <div
          className="flex h-44 flex-col items-center justify-center rounded-eds p-8 text-center"
          style={{ background: 'var(--eds-surface-2)', border: '1px stroke var(--eds-border)' }}
        >
          <Layers size={28} className="mb-2" style={{ color: 'var(--eds-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--eds-text)' }}>No projects found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--eds-muted)' }}>Get started by creating your first project node.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 w-full">
          {sortedAndFilteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={(e) => handleOpenWorkspace(e, project.id)}
              className="group relative flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-eds p-4 transition-all duration-150 cursor-pointer"
              style={{
                background: 'var(--eds-surface)',
                border: '1px solid var(--eds-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--eds-border-3)';
                e.currentTarget.style.background = 'var(--eds-surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--eds-border)';
                e.currentTarget.style.background = 'var(--eds-surface)';
              }}
            >
              {/* Project Icon & Name */}
              <div className="flex items-center gap-3.5 min-w-[220px]">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-eds font-extrabold text-xs font-mono shrink-0"
                  style={{
                    background: 'var(--eds-accent-dim)',
                    border: '1px solid var(--eds-accent-ring)',
                    color: 'var(--eds-accent-2)',
                  }}
                >
                  {project.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold transition-colors truncate" style={{ color: 'var(--eds-text)' }}>
                      {project.name}
                    </h3>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold font-mono shrink-0"
                      style={
                        project.is_active !== false
                          ? { background: 'var(--eds-success-dim)', color: 'var(--eds-success)', border: '1px solid rgba(16,185,129,0.25)' }
                          : { background: 'var(--eds-elevated)', color: 'var(--eds-muted)', border: '1px solid var(--eds-border-2)' }
                      }
                    >
                      {project.is_active !== false ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-[11px] truncate mt-0.5 max-w-xs" style={{ color: 'var(--eds-muted)' }}>
                    {project.description || 'Active webhook ingress workspace'}
                  </p>
                </div>
              </div>

              {/* Ingress metrics */}
              <div className="flex flex-wrap items-center gap-6 text-xs py-1 font-mono">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold" style={{ color: 'var(--eds-faint)' }}>24h Volume</span>
                  <span className="font-extrabold" style={{ color: 'var(--eds-text)' }}>
                    {project.total_webhooks.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold" style={{ color: 'var(--eds-faint)' }}>Success</span>
                  <span
                    className="font-extrabold"
                    style={{ color: project.success_rate_pct >= 90 ? 'var(--eds-success)' : 'var(--eds-danger-2)' }}
                  >
                    {project.success_rate_pct}%
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold" style={{ color: 'var(--eds-faint)' }}>Avg Latency</span>
                  <span className="font-extrabold" style={{ color: 'var(--eds-info)' }}>
                    {project.avg_latency_ms} ms
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold" style={{ color: 'var(--eds-faint)' }}>DLQ Items</span>
                  <span
                    className="font-extrabold"
                    style={{ color: project.dlq_count > 0 ? 'var(--eds-warning)' : 'var(--eds-muted)' }}
                  >
                    {project.dlq_count}
                  </span>
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleOpenWorkspace(e, project.id)}
                  className="eds-btn-outline py-1 px-3 text-xs"
                >
                  <span>Workspace</span>
                  <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
