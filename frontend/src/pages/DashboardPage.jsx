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
        
        {/* VERCEL/SUPABASE STYLE BANNER */}
        <section className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  System Operational
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
                Welcome back, {maskIdentity(user?.company_name || user?.email || 'Operator Console')}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {loading ? 'Connecting telemetry...' : `${activeProjects} Active Projects`}
              </p>
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 hover:bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 transition shadow-sm"
              >
                <Plus size={16} />
                <span>New Project</span>
              </Link>

              <Link
                to="/logs"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 transition shadow-sm"
              >
                <Terminal size={16} className="text-zinc-400" />
                <span>Live Stream</span>
              </Link>

              <Link
                to="/dlq"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 transition shadow-sm"
              >
                <AlertTriangle size={16} className="text-zinc-400" />
                <span>DLQ</span>
              </Link>
            </div>
          </div>
        </section>

        {/* METRICS DASHBOARD COMMAND CENTER */}
        <MetricsDashboard
          companyId={user?.company_id}
          identityLabel={maskIdentity(user?.company_name || user?.email || 'Operator Console')}
        />
      </div>
    </ProtectedLayout>
  );
}
