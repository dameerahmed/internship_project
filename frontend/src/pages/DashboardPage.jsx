import { useEffect, useMemo, useState } from 'react';
import { Plus, Terminal, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProtectedLayout from '../components/ProtectedLayout';
import MetricsDashboard from '../components/dashboard/MetricsDashboard';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';

const maskIdentity = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return 'Operator Console';
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    const [local, domain] = trimmed.split('@');
    const safeLocal = local.length > 3 ? `${local.slice(0, 2)}***${local.slice(-1)}` : '***';
    const safeDomain = domain.length > 4 ? `${domain.slice(0, 2)}***.${domain.split('.').pop()}` : '***';
    return `${safeLocal}@${safeDomain}`;
  }
  return trimmed.length > 12 ? `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}` : trimmed;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get(API_ENDPOINTS.PROJECTS.LIST);
        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : []);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProjects = useMemo(() => projects.filter((project) => project.is_active).length, [projects]);

  return (
    <ProtectedLayout title="Enterprise Command Center" eyebrow="Dashboard">
      <div className="space-y-6">
        
        {/* ENTERPRISE COMMAND BANNER & QUICK ACTIONS */}
        <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-[#08090e] p-6 shadow-[0_0_35px_-10px_rgba(16,185,129,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <p className="text-[10px] font-mono font-bold uppercase tracking-[0.35em] text-emerald-400">OPERATIONAL STATUS: OPTIMAL</p>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">
                Welcome back, {maskIdentity(user?.company_name || user?.email || 'Operator Console')}
              </h1>
              <p className="mt-1 text-xs text-zinc-400 font-mono">
                {loading ? 'Syncing gateway telemetry…' : `${activeProjects} active project routes • Real-time ingress, Redis, RabbitMQ & DLQ state.`}
              </p>
            </div>

            {/* Quick Actions Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-mono font-bold text-emerald-400 transition active:scale-95 shadow-sm"
              >
                <Plus size={14} />
                <span>NEW PROJECT</span>
              </Link>

              <Link
                to="/logs"
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-750 bg-[#121420] hover:bg-[#191c2e] px-3.5 py-2 text-xs font-mono font-bold text-zinc-200 transition active:scale-95 shadow-sm"
              >
                <Terminal size={14} className="text-cyan-400" />
                <span>LIVE LOGS</span>
              </Link>

              <Link
                to="/dlq"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3.5 py-2 text-xs font-mono font-bold text-rose-400 transition active:scale-95 shadow-sm"
              >
                <AlertTriangle size={14} />
                <span>DLQ WORKSPACE</span>
              </Link>
            </div>
          </div>
        </section>

        {/* METRICS DASHBOARD COMMAND CENTER */}
        <MetricsDashboard identityLabel={maskIdentity(user?.company_name || user?.email || 'Operator Console')} />
      </div>
    </ProtectedLayout>
  );
}
