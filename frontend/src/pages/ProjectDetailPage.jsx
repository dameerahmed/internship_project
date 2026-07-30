import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Activity, 
  Terminal, 
  AlertTriangle, 
  Sliders, 
  Zap, 
  Settings, 
  ArrowLeft,
  RefreshCw,
  X,
  CheckCircle2,
  KeyRound
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

  const {
    activeProject,
    setActiveProject,
    activeTab,
    setActiveTab,
    projectLoading,
    setProjectLoading
  } = useProjectStore();

  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const resolvedActiveTab = activeTab === 'security' ? 'settings' : activeTab;

  // Settings form state
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
      setForm({
        name: data.name || '',
        description: data.description || '',
        retention_mode: data.retention_mode || 'rolling_days',
        retention_days: data.retention_days ?? 30,
        delete_date: data.delete_date || '',
        delete_time: data.delete_time || '02:00',
        is_active: data.is_active ?? true,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load project node details' });
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
        <div className="flex h-80 items-center justify-center text-sm font-medium text-zinc-400">
          <RefreshCw className="mr-3 h-5 w-5 animate-spin text-emerald-500" />
          Initializing project workspace node...
        </div>
      </ProtectedLayout>
    );
  }

  if (!activeProject) {
    return (
      <ProtectedLayout title="Project Workspace" eyebrow="Project Deep-Dive">
        <div className="flex h-80 flex-col items-center justify-center text-center text-zinc-400">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Project Not Found or Access Forbidden</h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">
            This project node does not exist or does not belong to your organization.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/projects')}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg"
          >
            Return to Project Management
          </button>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="flex flex-col bg-white dark:bg-zinc-950/90 min-h-full text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl shadow-sm overflow-hidden backdrop-blur-xl transition-colors font-sans w-full">
        
        {/* Workspace Top Header */}
        <div className="px-6 lg:px-8 py-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                {activeProject.name}
              </h1>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-full border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-emerald-500 font-bold">
                Node #{activeProject.id}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                activeProject.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-zinc-200 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
              }`}>
                <span className={`h-2 w-2 rounded-full ${activeProject.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'}`} />
                {activeProject.is_active ? 'Active' : 'Paused'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 transition shadow-sm active:scale-95 shrink-0"
            >
              <KeyRound className="h-4 w-4" />
              <span>Settings & Keys</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-extrabold text-zinc-950 transition shadow-md active:scale-95 shrink-0"
            >
              <Zap className="h-4 w-4 fill-current" />
              <span>Simulate Webhook</span>
            </button>
          </div>
        </div>

        {/* Toast Feedback */}
        {feedback.message && (
          <div className={`mx-6 mt-4 rounded-2xl p-4 text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'error' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'error' ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="hover:opacity-75">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Workspace Active Tab Body */}
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