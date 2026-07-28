import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, AlertTriangle, CheckCircle2, Clock, Calendar, Database, ShieldCheck } from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import ProjectsGrid from '../components/dashboard/ProjectsGrid';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';
import { createProjectPayload } from '@/utils/projectPayloads';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  
  const [newProjectForm, setNewProjectForm] = useState({
    name: '',
    description: '',
    targetUrl: '',
    retentionMode: 'preset_days',
    retentionDays: 30,
    deleteDate: '',
    deleteHour: '04',
    deleteMinute: '03',
    deleteSecond: '02',
  });

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(API_ENDPOINTS.PROJECTS.LIST);
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load projects' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newProjectForm.name.trim()) return;

    setCreating(true);
    setFeedback({ type: '', message: '' });
    try {
      const formattedTime = `${String(newProjectForm.deleteHour).padStart(2, '0')}:${String(newProjectForm.deleteMinute).padStart(2, '0')}:${String(newProjectForm.deleteSecond).padStart(2, '0')}`;
      
      const payload = createProjectPayload({
        name: newProjectForm.name.trim(),
        description: newProjectForm.description.trim(),
        eventConfigs: [{ event_type: 'webhook.received', target_urls: [newProjectForm.targetUrl.trim()] }],
        isActive: true,
        retentionMode: newProjectForm.retentionMode,
        retentionDays: Number(newProjectForm.retentionDays),
        deleteDate: newProjectForm.deleteDate,
        deleteTime: formattedTime,
      });

      payload.metadata_json = {
        retention_mode: newProjectForm.retentionMode,
        delete_hour: newProjectForm.deleteHour,
        delete_minute: newProjectForm.deleteMinute,
        delete_second: newProjectForm.deleteSecond,
        delete_time: formattedTime,
      };

      const { data: created } = await apiClient.post(API_ENDPOINTS.PROJECTS.CREATE, payload);
      setFeedback({ type: 'success', message: `✓ Project "${created.name}" created successfully!` });
      setShowCreateModal(false);
      setNewProjectForm({
        name: '',
        description: '',
        targetUrl: '',
        retentionMode: 'preset_days',
        retentionDays: 30,
        deleteDate: '',
        deleteHour: '04',
        deleteMinute: '03',
        deleteSecond: '02',
      });
      navigate(`/dashboard/projects/${created.id}`);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to create project.' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedLayout title="Project Management Directory" eyebrow="Workspace Setup">
      <div className="flex flex-col gap-6 font-sans">
        {feedback.message && (
          <div className={`rounded-2xl p-4 text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'error' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'error' ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="hover:opacity-75">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <ProjectsGrid
          projects={projects}
          onRefresh={loadProjects}
          onCreateClick={() => setShowCreateModal(true)}
        />

        {/* Provision New Project Node Modal with Custom Data Retention */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 space-y-5 shadow-2xl custom-scrollbar">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-500" />
                  Provision New Project Workspace Node
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4 text-xs font-sans">
                {/* Basic Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Payment Gateway Ingestion"
                      value={newProjectForm.name}
                      onChange={(e) => setNewProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Optional project purpose..."
                      value={newProjectForm.description}
                      onChange={(e) => setNewProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Default Webhook Endpoint URL *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.yourcompany.com/webhooks"
                    value={newProjectForm.targetUrl}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, targetUrl: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 font-mono text-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-emerald-400 outline-none focus:border-emerald-500"
                  />
                </div>

                {/* 🛡️ Custom Data Retention & Scheduling Settings */}
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                    <Clock className="h-4 w-4" />
                    <span>Project-Level Retention & Purge Settings</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                        Retention Policy Mode
                      </label>
                      <select
                        value={newProjectForm.retentionMode}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, retentionMode: e.target.value }))}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      >
                        <option value="preset_days">Rolling Retention (Days)</option>
                        <option value="specific_datetime">Specific Expiration Date</option>
                        <option value="interval_schedule">Custom Cron Interval</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                        Retention Period (Days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={newProjectForm.retentionDays}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, retentionDays: e.target.value }))}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Daily Purge Schedule */}
                  <div>
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                      Daily Automated Purge Execution Time (HH : MM : SS)
                    </label>
                    <div className="flex items-center gap-2 font-mono">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={newProjectForm.deleteHour}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deleteHour: e.target.value }))}
                        className="w-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={newProjectForm.deleteMinute}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deleteMinute: e.target.value }))}
                        className="w-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={newProjectForm.deleteSecond}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deleteSecond: e.target.value }))}
                        className="w-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans ml-2">(UTC)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-semibold text-zinc-600 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                  >
                    {creating ? 'Provisioning...' : 'Provision Project Workspace'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
