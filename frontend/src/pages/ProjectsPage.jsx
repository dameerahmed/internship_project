import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
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
      <div className="flex flex-col gap-6 font-display">
        {feedback.message && (
          <div
            className="rounded-eds p-4 text-xs font-semibold flex items-center justify-between"
            style={{
              background: feedback.type === 'error' ? 'var(--eds-danger-dim)' : 'var(--eds-success-dim)',
              border: `1px solid ${feedback.type === 'error' ? 'rgba(244,63,94,0.25)' : 'rgba(16,185,129,0.25)'}`,
              color: feedback.type === 'error' ? 'var(--eds-danger-2)' : 'var(--eds-success)',
            }}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback({ type: '', message: '' })}>
              <X size={15} />
            </button>
          </div>
        )}

        <ProjectsGrid
          projects={projects}
          onRefresh={loadProjects}
          onCreateClick={() => setShowCreateModal(true)}
        />

        {/* Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-eds-xl p-6 space-y-5 shadow-eds-xl animate-pop-in"
              style={{
                background: 'var(--eds-panel-2)',
                border: '1px solid var(--eds-border-2)',
              }}
            >
              <div
                className="flex items-center justify-between pb-3"
                style={{ borderBottom: '1px solid var(--eds-border)' }}
              >
                <h3 className="text-base font-extrabold flex items-center gap-2" style={{ color: 'var(--eds-text)' }}>
                  <Plus size={18} style={{ color: 'var(--eds-success)' }} />
                  Provision New Project Workspace Node
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ color: 'var(--eds-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4 text-xs font-display">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="eds-label">Project Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Payment Gateway Ingestion"
                      value={newProjectForm.name}
                      onChange={(e) => setNewProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="eds-input font-bold"
                    />
                  </div>

                  <div>
                    <label className="eds-label">Description</label>
                    <input
                      type="text"
                      placeholder="Optional project purpose..."
                      value={newProjectForm.description}
                      onChange={(e) => setNewProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="eds-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="eds-label">Default Webhook Endpoint URL *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.yourcompany.com/webhooks"
                    value={newProjectForm.targetUrl}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, targetUrl: e.target.value }))}
                    className="eds-input text-eds-success"
                  />
                </div>

                {/* Retention settings */}
                <div
                  className="rounded-eds p-4 space-y-3"
                  style={{
                    background: 'var(--eds-surface-2)',
                    border: '1px solid var(--eds-border)',
                  }}
                >
                  <div className="flex items-center gap-2 font-bold text-xs" style={{ color: 'var(--eds-accent-2)' }}>
                    <Clock size={15} />
                    <span>Retention Policy &amp; Automated Purge Settings</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="eds-label">Retention Policy Mode</label>
                      <select
                        value={newProjectForm.retentionMode}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, retentionMode: e.target.value }))}
                        className="eds-input"
                      >
                        <option value="preset_days">Rolling Retention (Days)</option>
                        <option value="specific_datetime">Specific Expiration Date</option>
                        <option value="interval_schedule">Custom Cron Interval</option>
                      </select>
                    </div>

                    <div>
                      <label className="eds-label">Retention Period (Days)</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={newProjectForm.retentionDays}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, retentionDays: e.target.value }))}
                        className="eds-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="eds-label">Purge Execution Time (HH : MM : SS UTC)</label>
                    <div className="flex items-center gap-2 font-mono">
                      <input
                        type="number" min={0} max={23}
                        value={newProjectForm.deleteHour}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deleteHour: e.target.value }))}
                        className="eds-input text-center w-16"
                      />
                      <span>:</span>
                      <input
                        type="number" min={0} max={59}
                        value={newProjectForm.deleteMinute}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deleteMinute: e.target.value }))}
                        className="eds-input text-center w-16"
                      />
                      <span>:</span>
                      <input
                        type="number" min={0} max={59}
                        value={newProjectForm.deleteSecond}
                        onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deleteSecond: e.target.value }))}
                        className="eds-input text-center w-16"
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="pt-3 flex justify-end gap-3"
                  style={{ borderTop: '1px solid var(--eds-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="eds-btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="eds-btn-primary"
                  >
                    {creating ? 'Provisioning…' : 'Provision Project Workspace'}
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
