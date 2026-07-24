import { useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ProtectedLayout from '../components/ProtectedLayout';
import MetricsDashboard from '../components/dashboard/MetricsDashboard';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

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

  return (
    <ProtectedLayout title="Control center" eyebrow="Workspace">
      <div className="flex flex-col bg-white min-h-full font-sans text-gray-900 border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        
        {/* Thirdweb Style Header */}
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Webhooks
              </h1>
              <p className="mt-1 text-sm text-gray-500 font-medium">
                Last 24 hours activity
              </p>
            </div>

            <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition shadow-sm">
              <MessageSquare size={14} className="text-gray-400" />
              Submit Feedback
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-6 mt-6 border-b border-gray-100 text-sm font-medium text-gray-500">
            <Link to="/" className="pb-3 border-b-2 border-blue-600 text-gray-900">
              Overview
            </Link>
            <Link to="/projects" className="pb-3 border-b-2 border-transparent hover:text-gray-900 transition">
              Projects
            </Link>
            <Link to="/logs" className="pb-3 border-b-2 border-transparent hover:text-gray-900 transition">
              Live Stream
            </Link>
            <Link to="/dlq" className="pb-3 border-b-2 border-transparent hover:text-gray-900 transition">
              DLQ Management
            </Link>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-8">
          <MetricsDashboard
            companyId={user?.company_id}
            identityLabel={user?.company_name || user?.email || 'Operator Console'}
          />
        </div>

      </div>
    </ProtectedLayout>
  );
}
