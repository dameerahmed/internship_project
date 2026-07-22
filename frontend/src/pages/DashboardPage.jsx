import { useEffect, useMemo, useState } from 'react';
import { Plus, Terminal, AlertTriangle, Activity } from 'lucide-react';
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
    <ProtectedLayout title="Webhook Gateway Dashboard" eyebrow="Overview">
      <div className="space-y-6">
        
        {/* SLEEK ENVATO-STYLE COMMAND BANNER */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-r from-[#0d0e17] via-[#10121e] to-[#0d0e17] p-6 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
                  SYSTEM ONLINE • 100% OPERATIONAL
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">
                Welcome back, {maskIdentity(user?.company_name || user?.email || 'Operator Console')}
              </h1>
              <p className="mt-1 text-xs text-zinc-400 font-mono">
                {loading ? 'Connecting telemetry...' : `${activeProjects} Active Projects • Real-Time Ingress Traffic & Redis/RabbitMQ Engine`}
              </p>
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-2 text-xs font-mono font-bold text-zinc-950 transition active:scale-95 shadow-md"
              >
                <Plus size={14} />
                <span>New Project</span>
              </Link>

              <Link
                to="/logs"
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#141624] hover:bg-[#1a1d30] px-3.5 py-2 text-xs font-mono font-bold text-zinc-200 transition active:scale-95 shadow-sm"
              >
                <Terminal size={14} className="text-cyan-400" />
                <span>Live Stream</span>
              </Link>

              <Link
                to="/dlq"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3.5 py-2 text-xs font-mono font-bold text-rose-400 transition active:scale-95 shadow-sm"
              >
                <AlertTriangle size={14} />
                <span>DLQ Queue</span>
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
