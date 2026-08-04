import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Terminal,
  AlertTriangle,
  SlidersHorizontal,
  Send,
  ArrowLeft,
  RefreshCw,
  X,
  CheckCircle2,
  KeyRound,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import OverviewTab from '../components/project/tabs/OverviewTab';
import EventConfigTab from '../components/project/tabs/EventConfigTab';
import SimulatorTab from '../components/project/tabs/SimulatorTab';
import LiveLogsTab from '../components/project/tabs/LiveLogsTab';
import DLQTab from '../components/project/tabs/DLQTab';
import SettingsTab from '../components/project/tabs/SettingsTab';

import { useProjectStore } from '@/store/useProjectStore';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const activeProject = useProjectStore((s) => s.activeProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const projectLoading = useProjectStore((s) => s.projectLoading);
  const setProjectLoading = useProjectStore((s) => s.setProjectLoading);

  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const resolvedActiveTab = activeTab === 'security' ? 'settings' : activeTab;

  const [form, setForm] = useState({
    name: '',
    description: '',
    retention_mode: 'rolling_days',
    retention_days: 30,
    delete_date: '',
    delete_time: '02:00',
    is_active: true,
  });

  const loadProject = async (silent = false) => {
    if (!projectId) return;
    const isDifferentProject = !activeProject || activeProject.id !== Number(projectId);
    if (!silent && isDifferentProject) {
      setProjectLoading(true);
    }
    try {
      const { data } = await apiClient.get(API_ENDPOINTS.PROJECTS.DETAIL(projectId));
      setActiveProject(data);
      setForm((prev) => {
        const nextForm = {
          name: data.name || '',
          description: data.description || '',
          retention_mode: data.retention_mode || 'rolling_days',
          retention_days: data.retention_days ?? 30,
          delete_date: data.delete_date || '',
          delete_time: data.delete_time || '02:00',
          is_active: data.is_active ?? true,
        };
        return JSON.stringify(prev) === JSON.stringify(nextForm) ? prev : nextForm;
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load project details' });
    } finally {
      if (!silent && isDifferentProject) {
        setProjectLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!activeProject || activeProject.id !== Number(projectId)) {
      loadProject(false);
    }
  }, [projectId]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!activeProject?.id) return;
    try {
      const { data } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(activeProject.id), {
        name: form.name,
        description: form.description,
        is_active: form.is_active,
        retention_mode: form.retention_mode,
        retention_days: form.retention_days,
        delete_date: form.delete_date,
        delete_time: form.delete_time,
      });
      setActiveProject(data);
      setForm((prev) => ({
        ...prev,
        retention_mode: data.retention_mode || prev.retention_mode || 'rolling_days',
        retention_days: data.retention_days ?? prev.retention_days ?? 30,
        delete_date: data.delete_date || '',
        delete_time: data.delete_time || prev.delete_time || '02:00',
      }));
      setFeedback({ type: 'success', message: '✓ Project workspace settings updated successfully.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update project settings.' });
    }
  };

  const handleToggleActive = async () => {
    if (!activeProject?.id) return;
    try {
      const { data } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(activeProject.id), {
        is_active: !activeProject.is_active,
      });
      setActiveProject(data);
      setFeedback({
        type: 'success',
        message: `✓ Project ${data.is_active ? 'activated' : 'paused'} successfully.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle project state.' });
    }
  };

  const handleDeleteProject = async () => {
    if (!activeProject?.id) return;
    if (!window.confirm(`Permanently delete project "${activeProject.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(activeProject.id));
      navigate('/dashboard/projects');
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete project.' });
    }
  };

  const handlePurgeData = async () => {
    if (!activeProject?.id) return;
    if (!window.confirm('Purge historical webhook logs & DLQ items for this project?')) {
      return;
    }
    try {
      await apiClient.post(`/v1/projects/purge/${activeProject.id}`);
      setFeedback({ type: 'success', message: '✓ Project historical logs & DLQ purged.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to purge project data.' });
    }
  };

  if (projectLoading) {
    return (
      <ProtectedLayout title="Loading Project Workspace..." eyebrow="Project Workspace">
        <div className="flex h-80 flex-col items-center justify-center gap-3 text-xs font-semibold" style={{ color: 'var(--eds-muted)' }}>
          <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--eds-accent-2)' }} />
          <span>Initializing workspace telemetry...</span>
        </div>
      </ProtectedLayout>
    );
  }

  if (!activeProject) {
    return (
      <ProtectedLayout title="Project Workspace" eyebrow="Project Deep-Dive">
        <div className="flex h-80 flex-col items-center justify-center text-center">
          <AlertTriangle size={32} className="mb-3" style={{ color: 'var(--eds-warning)' }} />
          <h2 className="text-base font-bold" style={{ color: 'var(--eds-text)' }}>Project Not Found or Access Forbidden</h2>
          <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--eds-muted)' }}>
            This project node does not exist or does not belong to your organization.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/projects')}
            className="eds-btn-primary mt-4"
          >
            Return to Project Directory
          </button>
        </div>
      </ProtectedLayout>
    );
  }

  const tabs = [
    { id: 'overview',  label: 'Overview',      icon: BarChart3 },
    { id: 'events',    label: 'Event Config',  icon: SlidersHorizontal },
    { id: 'simulator', label: 'Simulator',     icon: Send, iconColor: 'var(--eds-warning)' },
    { id: 'logs',      label: 'Live Logs',     icon: Terminal },
    { id: 'dlq',       label: 'DLQ',           icon: Inbox, iconColor: 'var(--eds-danger-2)' },
    { id: 'settings',  label: 'Settings',      icon: ShieldCheck, iconColor: 'var(--eds-accent-2)' },
  ];

  return (
    <ProtectedLayout>
      <div
        className="flex flex-col min-h-full rounded-eds-xl shadow-eds-lg overflow-hidden font-display w-full"
        style={{
          background: 'var(--eds-panel)',
          border: '1px solid var(--eds-border-2)',
        }}
      >
        {/* Workspace Top Header */}
        <div
          className="px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          style={{
            background: 'var(--eds-surface)',
            borderBottom: '1px solid var(--eds-border)',
          }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--eds-text)' }}>
                {activeProject.name}
              </h1>
              <span
                className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
                style={{
                  background: 'var(--eds-accent-dim)',
                  border: '1px solid var(--eds-accent-ring)',
                  color: 'var(--eds-accent-2)',
                }}
              >
                Node #{activeProject.id}
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full"
                style={
                  activeProject.is_active
                    ? { background: 'var(--eds-success-dim)', color: 'var(--eds-success)', border: '1px solid rgba(16,185,129,0.25)' }
                    : { background: 'var(--eds-elevated)', color: 'var(--eds-muted)', border: '1px solid var(--eds-border-2)' }
                }
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: activeProject.is_active ? 'var(--eds-success)' : 'var(--eds-muted)' }}
                />
                {activeProject.is_active ? 'Active' : 'Paused'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="eds-btn-outline text-xs py-1.5 px-3"
            >
              <KeyRound size={14} />
              <span>Settings &amp; Keys</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className="eds-btn-primary text-xs py-1.5 px-3"
            >
              <Send size={14} />
              <span>Simulate Webhook</span>
            </button>
          </div>
        </div>

        {/* Workspace Tab Strip Navigation */}
        <div
          className="flex items-center gap-1 px-6 pt-2 border-b overflow-x-auto"
          style={{ background: 'var(--eds-surface)', borderBottomColor: 'var(--eds-border)' }}
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = resolvedActiveTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150 whitespace-nowrap"
                style={
                  isActive
                    ? {
                        borderBottomColor: 'var(--eds-accent)',
                        color: 'var(--eds-accent-2)',
                        background: 'var(--eds-accent-dim)',
                      }
                    : {
                        borderBottomColor: 'transparent',
                        color: 'var(--eds-muted)',
                      }
                }
              >
                <Icon size={14} style={{ color: isActive ? 'var(--eds-accent-2)' : t.iconColor || 'var(--eds-muted)' }} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Toast Feedback */}
        {feedback.message && (
          <div
            className="mx-6 mt-4 rounded-eds p-4 text-xs font-semibold flex items-center justify-between"
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

        {/* Tab Body */}
        <div className="p-6 lg:p-8 flex-1">
          {resolvedActiveTab === 'overview' && (
            <OverviewTab project={activeProject} onNavigateTab={setActiveTab} />
          )}

          {resolvedActiveTab === 'events' && (
            <EventConfigTab project={activeProject} onRefresh={() => loadProject(true)} />
          )}

          {resolvedActiveTab === 'simulator' && (
            <SimulatorTab project={activeProject} />
          )}

          {resolvedActiveTab === 'logs' && (
            <LiveLogsTab project={activeProject} />
          )}

          {resolvedActiveTab === 'dlq' && (
            <DLQTab project={activeProject} />
          )}

          {(resolvedActiveTab === 'settings' || resolvedActiveTab === 'security') && (
            <SettingsTab
              project={activeProject}
              form={form}
              setForm={setForm}
              onSave={handleSaveSettings}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteProject}
              onPurge={handlePurgeData}
            />
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}