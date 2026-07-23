import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  KeyRound, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Database, 
  Copy, 
  AlertTriangle,
  Zap,
  ShieldCheck,
  Calendar,
  Save,
  Check,
  Clock,
  RefreshCw,
  X,
  Sliders,
  ChevronDown,
  ChevronUp,
  Lock,
  Sparkles
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';
import { createProjectPayload } from '@/utils/projectPayloads';

const blankForm = (project) => {
  const metadata = project?.metadata_json || {};
  return {
    name: project?.name || '',
    description: project?.description || '',
    eventConfigs: project?.event_configs?.length
      ? project.event_configs.map((config) => {
          const keys = Array.isArray(config.payload_keys) && config.payload_keys.length
            ? config.payload_keys
            : (Array.isArray(config.metadata_json?.payload_keys) && config.metadata_json.payload_keys.length
              ? config.metadata_json.payload_keys
              : (config.payload_key ? [config.payload_key] : (config.metadata_json?.payload_key ? [config.metadata_json.payload_key] : [])));

          const types = Array.isArray(config.payload_types) && config.payload_types.length
            ? config.payload_types
            : (Array.isArray(config.metadata_json?.payload_types) && config.metadata_json.payload_types.length
              ? config.metadata_json.payload_types
              : (config.payload_type ? [config.payload_type] : (config.metadata_json?.payload_type ? [config.metadata_json.payload_type] : [])));

          const payload_rules = keys.map((key, i) => ({
            key: key || '',
            type: types[i] || 'string'
          }));

          return {
            event_type: config.event_type || 'webhook.received',
            target_urls: Array.isArray(config.metadata_json?.urls) && config.metadata_json.urls.length
              ? config.metadata_json.urls
              : [config.target_url || 'https://example.com/webhook'],
            payload_rules: payload_rules.length ? payload_rules : [{ key: 'event.id', type: 'string' }],
            payload_keys: keys.length ? keys : ['event.id'],
            payload_types: types.length ? types : ['string'],
            id: config.id,
            is_active: config.is_active ?? true,
          };
        })
      : [{ 
          event_type: 'webhook.received', 
          target_urls: ['https://example.com/webhook'], 
          payload_rules: [{ key: 'event.id', type: 'string' }, { key: 'amount', type: 'number' }, { key: 'status', type: 'string' }], 
          payload_keys: ['event.id', 'amount', 'status'], 
          payload_types: ['string', 'number', 'string'] 
        }],
    isActive: project?.is_active ?? true,
    retentionMode: project?.retention_mode || metadata?.retention_mode || 'preset_days',
    retentionDays: project?.retention_days ?? 7,
    deleteDate: project?.delete_date || metadata?.delete_date || '',
    // Detailed Custom Time (Hours, Minutes, Seconds)
    deleteHour: metadata?.delete_hour || '04',
    deleteMinute: metadata?.delete_minute || '03',
    deleteSecond: metadata?.delete_second || '02',
    deleteTime: project?.delete_time || metadata?.delete_time || '04:03:02',
    intervalUnit: metadata?.interval_unit || 'hours',
    intervalValue: metadata?.interval_value ?? 1,
    dayOfWeek: metadata?.day_of_week || 'monday',
    purgeEvents: true,
    purgeLogs: true,
  };
};

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [purging, setPurging] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  
  // Real Credentials State
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false); // Hidden by default!
  const [copiedField, setCopiedField] = useState('');

  // Expandable Time & Retention Box State (Hidden by default!)
  const [showScheduleBox, setShowScheduleBox] = useState(false);

  // Form State
  const [form, setForm] = useState(blankForm(null));

  // Webhook Tester Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testApiKey, setTestApiKey] = useState('');
  const [testSecretKey, setTestSecretKey] = useState('');
  const [testEventType, setTestEventType] = useState('');
  const [testPayloadStr, setTestPayloadStr] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchCredentials = async (id) => {
    try {
      setGenerating(true);
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${id}`);
      if (data && data.api_key && data.secret_key) {
        setGeneratedKeys({ api_key: data.api_key, secret_key: data.secret_key });
        return data;
      }
    } catch (err) {
      console.warn('Failed to fetch credentials:', err);
    } finally {
      setGenerating(false);
    }
    return null;
  };

  const loadProject = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: found } = await apiClient.get(API_ENDPOINTS.PROJECTS.GET(projectId));

      if (!found) {
        setFeedback({ type: 'error', message: 'Project not found.' });
        setProject(null);
        return;
      }

      setProject(found);
      setForm(blankForm(found));
      sessionStorage.setItem('selectedProjectId', String(found.id));

      // Pre-fetch real unmasked keys in background
      await fetchCredentials(found.id);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to load project details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [projectId, user?.email]);

  const handleOpenCredentials = async () => {
    setShowCredentialsModal(true);
    if (!generatedKeys?.api_key || !generatedKeys?.secret_key) {
      await fetchCredentials(project?.id || projectId);
    }
  };

  const handleCopy = async (text, label = 'Credential') => {
    let copyVal = text;

    if (!copyVal || copyVal.includes('Fetching')) {
      const data = await fetchCredentials(project?.id || projectId);
      if (data) {
        copyVal = label.toLowerCase().includes('api') ? data.api_key : data.secret_key;
      } else {
        setFeedback({ type: 'error', message: 'Unable to retrieve real credentials to copy.' });
        return;
      }
    }

    performCopy(copyVal, label);
  };

  const performCopy = async (text, label) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedField(label);
      setFeedback({ type: 'success', message: `✓ ${label} copied to clipboard!` });
      setTimeout(() => setCopiedField(''), 3500);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to copy to clipboard.' });
    }
  };

  const handleSave = async (event) => {
    if (event) event.preventDefault();
    if (!project) return;

    setSaving(true);
    setFeedback({ type: '', message: '' });

    const formattedTime = `${String(form.deleteHour).padStart(2, '0')}:${String(form.deleteMinute).padStart(2, '0')}:${String(form.deleteSecond).padStart(2, '0')}`;

    try {
      const payload = createProjectPayload({
        name: form.name,
        description: form.description,
        eventConfigs: form.eventConfigs,
        isActive: form.isActive,
        retentionMode: form.retentionMode,
        retentionDays: form.retentionDays,
        deleteDate: form.deleteDate,
        deleteTime: formattedTime,
      });

      payload.metadata_json = {
        ...(project.metadata_json || {}),
        retention_mode: form.retentionMode,
        interval_unit: form.intervalUnit,
        interval_value: form.intervalValue,
        day_of_week: form.dayOfWeek,
        delete_date: form.deleteDate,
        delete_hour: form.deleteHour,
        delete_minute: form.deleteMinute,
        delete_second: form.deleteSecond,
        delete_time: formattedTime,
      };

      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), payload);
      setProject((prev) => (prev ? { ...prev, ...updated, event_configs: prev.event_configs } : prev));
      setFeedback({ type: 'success', message: '✓ Project details & schedule saved successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to save project settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!project) return;

    const nextValue = !project.is_active;
    const previousProject = project;
    setProject((prev) => (prev ? { ...prev, is_active: nextValue } : prev));
    setForm((prev) => ({ ...prev, isActive: nextValue }));

    setToggling(true);
    try {
      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), { is_active: nextValue });
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
      setForm((prev) => ({ ...prev, isActive: updated.is_active ?? nextValue }));
      setFeedback({ type: 'success', message: `Project ${nextValue ? 'activated' : 'paused'}.` });
    } catch (error) {
      setProject(previousProject);
      setForm((prev) => ({ ...prev, isActive: previousProject.is_active }));
      setFeedback({ type: 'error', message: error.message || 'Failed to update status.' });
    } finally {
      setToggling(false);
    }
  };

  const handleRotateCredentials = async () => {
    if (!project || !window.confirm('Regenerate API Credentials? Apps using current keys will need updating.')) {
      return;
    }
    const data = await fetchCredentials(project.id);
    if (data) {
      setFeedback({ type: 'success', message: '✓ Real API credentials regenerated successfully!' });
    }
  };

  const handleDelete = async () => {
    if (!project || !window.confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(project.id));
      sessionStorage.removeItem('selectedProjectId');
      navigate('/projects');
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to delete project.' });
    }
  };

  const handlePurgeNow = async () => {
    if (!project || !window.confirm(`Purge all webhook events and delivery logs for "${project.name}" right now?`)) {
      return;
    }

    setPurging(true);
    try {
      const { data } = await apiClient.post(`/v1/projects/${project.id}/purge`);
      setFeedback({ type: 'success', message: data.message || '✓ Data purged successfully!' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to purge data.' });
    } finally {
      setPurging(false);
    }
  };

  const handleOpenTestModal = async () => {
    setShowTestModal(true);
    setTestResult(null);
    const activeConfigs = form.eventConfigs || [];
    const firstEvt = activeConfigs[0]?.event_type || 'webhook.received';
    setTestEventType(firstEvt);

    const samplePayload = { event: firstEvt };
    const rules = activeConfigs[0]?.payload_rules || [];
    rules.forEach((r) => {
      if (!r.key) return;
      if (r.type === 'number') samplePayload[r.key] = 99.99;
      else if (r.type === 'boolean') samplePayload[r.key] = true;
      else if (r.type === 'object') samplePayload[r.key] = { id: 1 };
      else if (r.type === 'array') samplePayload[r.key] = [1, 2];
      else samplePayload[r.key] = 'sample_value';
    });

    setTestPayloadStr(JSON.stringify(samplePayload, null, 2));

    if (generatedKeys?.api_key && generatedKeys?.secret_key) {
      setTestApiKey(generatedKeys.api_key);
      setTestSecretKey(generatedKeys.secret_key);
    } else if (project?.id) {
      const keys = await fetchCredentials(project.id);
      if (keys) {
        setTestApiKey(keys.api_key);
        setTestSecretKey(keys.secret_key);
      }
    }
  };

  const handleDispatchTestWebhook = async () => {
    if (!testApiKey || !testSecretKey) {
      alert('API Key and Secret Key are required.');
      return;
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(testPayloadStr);
    } catch {
      alert('Invalid JSON in test payload field.');
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    try {
      const { data } = await apiClient.post('/v1/gateway/test', {
        api_key: testApiKey,
        secret_key: testSecretKey,
        event_type: testEventType || 'webhook.received',
        payload: parsedPayload,
      });
      setTestResult(data);
    } catch (err) {
      setTestResult({
        status: 'Failed',
        detail: err.response?.data?.detail || err.message || 'Gateway Test Failed',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const updateEventConfig = (index, updater) => {
    setForm((prev) => ({
      ...prev,
      eventConfigs: prev.eventConfigs.map((config, configIndex) => (configIndex === index ? updater(config) : config)),
    }));
  };

  const formattedTimeString = `${String(form.deleteHour).padStart(2, '0')}:${String(form.deleteMinute).padStart(2, '0')}:${String(form.deleteSecond).padStart(2, '0')}`;

  if (loading) {
    return (
      <ProtectedLayout title="Loading Project Details..." eyebrow="Projects">
        <div className="flex h-80 items-center justify-center text-sm font-medium text-zinc-400">
          <RefreshCw className="mr-3 h-5 w-5 animate-spin text-emerald-400" />
          Loading project configuration & credentials…
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title={project?.name || 'Project Details'} eyebrow="Project Management">
      <div className="max-w-6xl mx-auto space-y-8 py-6 px-4 sm:px-6">
        
        {/* TOP HEADER PANEL */}
        <section className="rounded-2xl border border-zinc-800 bg-[#0c0e17] p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <button 
                type="button" 
                onClick={() => navigate('/projects')} 
                className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-emerald-400 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Projects
              </button>
              
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  {project?.name || 'Project Details'}
                </h1>
                
                {/* Active / Paused Switch */}
                <div className="flex items-center gap-3 rounded-full border border-zinc-800 bg-[#121524] px-4 py-1.5 text-xs font-semibold">
                  <span className={form.isActive ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                    {form.isActive ? 'Active Node' : 'Paused'}
                  </span>
                  <button
                    type="button"
                    disabled={toggling}
                    onClick={handleToggleActive}
                    className={`relative h-5 w-10 rounded-full p-0.5 transition ${form.isActive ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Header Action Buttons (Clean & Spacious) */}
            <div className="flex flex-wrap items-center gap-3">
              {/* BUTTON TO SHOW HIDDEN API CREDENTIALS MODAL */}
              <button 
                type="button" 
                onClick={handleOpenCredentials} 
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-400 transition active:scale-95 shadow-sm"
              >
                <KeyRound className="h-4 w-4" />
                <span>View API Credentials</span>
              </button>

              <button 
                type="button" 
                onClick={handleOpenTestModal} 
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-bold text-zinc-950 transition active:scale-95 shadow-md"
              >
                <Zap className="h-4 w-4" />
                <span>Test Webhook</span>
              </button>

              <button 
                type="button" 
                onClick={() => navigate(`/projects/${projectId}/logs`)} 
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-[#161928] hover:bg-[#1e2238] px-4 py-2.5 text-xs font-semibold text-zinc-200 transition active:scale-95"
              >
                <Database className="h-4 w-4 text-cyan-400" />
                <span>View Logs</span>
              </button>

              <button 
                type="button" 
                onClick={handleDelete} 
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2.5 text-xs font-semibold text-rose-400 transition active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </section>

        {/* FEEDBACK TOAST ALERT */}
        {feedback.message && (
          <div className={`rounded-2xl px-5 py-3.5 text-xs font-semibold flex items-center justify-between gap-3 shadow-lg border ${feedback.type === 'error' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'}`}>
            <div className="flex items-center gap-3">
              {feedback.type === 'error' ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="hover:opacity-75">
              <X size={16} />
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          
          {/* SECTION 1: PROJECT BASIC DETAILS */}
          <section className="rounded-2xl border border-zinc-800 bg-[#0c0e17] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  Project Configuration
                </h2>
                <p className="text-xs text-zinc-400 mt-1">Manage project name, description, and status.</p>
              </div>
              <span className="text-xs font-mono text-zinc-500 bg-[#121524] border border-zinc-800 px-3 py-1.5 rounded-xl">ID: #{project?.id}</span>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">Project Name</label>
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 transition"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Payment Gateway Ingestion"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">Description</label>
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-400 transition"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional project description..."
                />
              </div>
            </div>
          </section>

          {/* SECTION 2: TIME & RETENTION SCHEDULE (HIDDEN BY DEFAULT, REVEALED ON CLICK!) */}
          <section className="rounded-2xl border border-zinc-800 bg-[#0c0e17] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <Clock className="h-5 w-5 text-cyan-400" />
                  Time & Data Retention Schedule
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Schedule Execution Time: <span className="font-mono text-emerald-400 font-bold">{formattedTimeString}</span> ({form.retentionDays} Days Retention)
                </p>
              </div>

              {/* BUTTON TO REVEAL TIME & SCHEDULE BOX */}
              <button
                type="button"
                onClick={() => setShowScheduleBox((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 text-xs font-bold text-cyan-300 transition active:scale-95 shrink-0"
              >
                <Sliders className="h-4 w-4" />
                <span>{showScheduleBox ? 'Hide Schedule Settings' : 'Configure Schedule Settings'}</span>
                {showScheduleBox ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {/* EXPANDABLE SCHEDULE CONFIGURATION BOX (Opens when user clicks!) */}
            {showScheduleBox && (
              <div className="rounded-xl border border-zinc-800 bg-[#080910] p-6 space-y-6 animate-in fade-in duration-200">
                
                {/* Schedule Mode Options */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Schedule & Purge Mode
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'preset_days' }))}
                      className={`rounded-xl p-3.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'preset_days' || form.retentionMode === 'rolling_days' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' : 'border-zinc-800 bg-[#0c0e17] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold text-sm">🔄 Rolling Days</div>
                      <div className="text-[11px] opacity-75 mt-1">7, 14, 30, 90 Days</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'custom_interval' }))}
                      className={`rounded-xl p-3.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'custom_interval' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' : 'border-zinc-800 bg-[#0c0e17] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold text-sm">⏱️ Custom Interval</div>
                      <div className="text-[11px] opacity-75 mt-1">Every X hrs/mins/sec</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'specific_date' }))}
                      className={`rounded-xl p-3.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'specific_date' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' : 'border-zinc-800 bg-[#0c0e17] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold text-sm">📅 Specific Date</div>
                      <div className="text-[11px] opacity-75 mt-1">Exact Target Date</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'specific_day' }))}
                      className={`rounded-xl p-3.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'specific_day' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' : 'border-zinc-800 bg-[#0c0e17] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold text-sm">🗓️ Day of Week</div>
                      <div className="text-[11px] opacity-75 mt-1">Weekly Schedule</div>
                    </button>
                  </div>
                </div>

                {/* EXACT CUSTOM TIME PICKER: HOURS, MINUTES, SECONDS (UNLIMITED CUSTOM FREEDOM!) */}
                <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                  <label className="block text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    Exact Execution Time (Hours : Minutes : Seconds)
                  </label>
                  <p className="text-xs text-zinc-400">Set any custom time (e.g. 4 hours, 3 minutes, 2 seconds = 04:03:02).</p>
                  
                  <div className="grid grid-cols-3 gap-4 max-w-md">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Hours (0-23)</label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0e17] px-3.5 py-2.5 text-sm font-mono text-emerald-400 text-center outline-none focus:border-emerald-400"
                        value={form.deleteHour}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteHour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Minutes (0-59)</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0e17] px-3.5 py-2.5 text-sm font-mono text-emerald-400 text-center outline-none focus:border-emerald-400"
                        value={form.deleteMinute}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteMinute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Seconds (0-59)</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0e17] px-3.5 py-2.5 text-sm font-mono text-emerald-400 text-center outline-none focus:border-emerald-400"
                        value={form.deleteSecond}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteSecond: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      />
                    </div>
                  </div>
                </div>

                {/* MODE SPECIFIC EXTRA INPUTS */}
                {(form.retentionMode === 'preset_days' || form.retentionMode === 'rolling_days') && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">Retention Days Period</label>
                    <select
                      className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0e17] px-4 py-2.5 text-sm font-mono text-emerald-400 outline-none focus:border-emerald-400"
                      value={form.retentionDays}
                      onChange={(e) => setForm((prev) => ({ ...prev, retentionDays: parseInt(e.target.value) || 7 }))}
                    >
                      <option value={1}>1 Day Retention</option>
                      <option value={3}>3 Days Retention</option>
                      <option value={7}>7 Days Retention (Recommended)</option>
                      <option value={14}>14 Days Retention</option>
                      <option value={30}>30 Days Retention</option>
                      <option value={90}>90 Days Retention</option>
                      <option value={365}>365 Days Retention</option>
                    </select>
                  </div>
                )}

                {form.retentionMode === 'custom_interval' && (
                  <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-zinc-800/60">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">Interval Amount</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0e17] px-4 py-2.5 text-sm font-mono text-emerald-400 outline-none focus:border-emerald-400"
                        value={form.intervalValue}
                        onChange={(e) => setForm((prev) => ({ ...prev, intervalValue: Math.max(1, parseInt(e.target.value) || 1) }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">Time Unit</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0e17] px-4 py-2.5 text-sm font-mono text-zinc-200 outline-none focus:border-emerald-400"
                        value={form.intervalUnit}
                        onChange={(e) => setForm((prev) => ({ ...prev, intervalUnit: e.target.value }))}
                      >
                        <option value="seconds">Every X Seconds</option>
                        <option value="minutes">Every X Minutes</option>
                        <option value="hours">Every X Hours</option>
                        <option value="days">Every X Days</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.retentionMode === 'specific_date' && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">Target Expiration Date</label>
                    <input
                      type="date"
                      className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0e17] px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-emerald-400"
                      value={form.deleteDate || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, deleteDate: e.target.value }))}
                    />
                  </div>
                )}

                {/* PURGE TARGET SCOPE */}
                <div className="rounded-xl border border-zinc-800 bg-[#0c0e17] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-300">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="font-semibold text-zinc-400">Purge Scope Targets:</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.purgeEvents}
                        onChange={(e) => setForm((prev) => ({ ...prev, purgeEvents: e.target.checked }))}
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono text-cyan-300">webhook_events</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.purgeLogs}
                        onChange={(e) => setForm((prev) => ({ ...prev, purgeLogs: e.target.checked }))}
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono text-cyan-300">webhook_logs</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={purging}
                    onClick={handlePurgeNow}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-400 transition shrink-0"
                  >
                    <Trash2 size={14} />
                    <span>{purging ? 'Purging Data...' : 'Purge Data Now'}</span>
                  </button>
                </div>

              </div>
            )}
          </section>

          {/* SECTION 3: EVENT ROUTING & PAYLOAD SCHEMA */}
          <section className="rounded-2xl border border-zinc-800 bg-[#0c0e17] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Event Routing & Payload Schema</h2>
                <p className="text-xs text-zinc-400 mt-1">Configure target URLs and required JSON keys for each event.</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    eventConfigs: [
                      ...prev.eventConfigs,
                      {
                        event_type: 'custom.event',
                        target_urls: ['https://example.com/webhook'],
                        payload_rules: [{ key: 'event.id', type: 'string' }],
                        payload_keys: ['event.id'],
                        payload_types: ['string'],
                        is_active: true,
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition active:scale-95 shrink-0"
              >
                <Plus size={14} />
                <span>Add Event Rule</span>
              </button>
            </div>

            <div className="space-y-6">
              {form.eventConfigs.map((config, index) => (
                <div key={index} className="rounded-xl border border-zinc-800 bg-[#080910] p-5 space-y-4">
                  {/* Event Type Header */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-3">
                    <div className="flex items-center gap-3 flex-1 max-w-sm">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider shrink-0">Event Type:</label>
                      <input
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0e17] px-3.5 py-2 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-400"
                        value={config.event_type}
                        onChange={(e) =>
                          updateEventConfig(index, (item) => ({ ...item, event_type: e.target.value }))
                        }
                        placeholder="e.g. order.created"
                        required
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className={config.is_active ? 'text-emerald-400' : 'text-zinc-500'}>
                          {config.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateEventConfig(index, (item) => ({ ...item, is_active: !item.is_active }))
                          }
                          className={`relative h-5 w-9 rounded-full p-0.5 transition ${config.is_active ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                          <span className={`block h-4 w-4 rounded-full bg-white transition ${config.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {form.eventConfigs.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              eventConfigs: prev.eventConfigs.filter((_, i) => i !== index),
                            }))
                          }
                          className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:text-rose-400 transition"
                          title="Remove Event Rule"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Destination URLs */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-300 uppercase tracking-wider">Destination URLs</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateEventConfig(index, (item) => ({
                            ...item,
                            target_urls: [...item.target_urls, 'https://example.com/webhook'],
                          }))
                        }
                        className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <Plus size={12} /> Add URL
                      </button>
                    </div>

                    <div className="space-y-2">
                      {config.target_urls.map((url, urlIdx) => (
                        <div key={urlIdx} className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-xl border border-zinc-800 bg-[#0c0e17] px-3.5 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                            value={url}
                            onChange={(e) =>
                              updateEventConfig(index, (item) => ({
                                ...item,
                                target_urls: item.target_urls.map((u, i) => (i === urlIdx ? e.target.value : u)),
                              }))
                            }
                            placeholder="https://your-api.com/webhook"
                            required
                          />
                          {config.target_urls.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateEventConfig(index, (item) => ({
                                  ...item,
                                  target_urls: item.target_urls.filter((_, i) => i !== urlIdx),
                                }))
                              }
                              className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-rose-400 transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payload Rules */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-300 uppercase tracking-wider">Payload Schema Rules</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateEventConfig(index, (item) => {
                            const newRules = [...(item.payload_rules || []), { key: '', type: 'string' }];
                            return {
                              ...item,
                              payload_rules: newRules,
                              payload_keys: newRules.map((r) => r.key),
                              payload_types: newRules.map((r) => r.type),
                            };
                          })
                        }
                        className="text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <Plus size={12} /> Add Key Rule
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(config.payload_rules || []).map((rule, ruleIdx) => (
                        <div key={ruleIdx} className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-[#0c0e17] p-2">
                          <input
                            className="flex-1 rounded-lg border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-400"
                            value={rule.key}
                            onChange={(e) =>
                              updateEventConfig(index, (item) => {
                                const newRules = item.payload_rules.map((r, i) => (i === ruleIdx ? { ...r, key: e.target.value } : r));
                                return {
                                  ...item,
                                  payload_rules: newRules,
                                  payload_keys: newRules.map((r) => r.key),
                                  payload_types: newRules.map((r) => r.type),
                                };
                              })
                            }
                            placeholder="Key path (e.g. amount, user.id)"
                          />

                          <select
                            className="w-36 rounded-lg border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-400"
                            value={rule.type}
                            onChange={(e) =>
                              updateEventConfig(index, (item) => {
                                const newRules = item.payload_rules.map((r, i) => (i === ruleIdx ? { ...r, type: e.target.value } : r));
                                return {
                                  ...item,
                                  payload_rules: newRules,
                                  payload_keys: newRules.map((r) => r.key),
                                  payload_types: newRules.map((r) => r.type),
                                };
                              })
                            }
                          >
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="integer">integer</option>
                            <option value="boolean">boolean</option>
                            <option value="object">object</option>
                            <option value="array">array</option>
                            <option value="any">any</option>
                          </select>

                          {config.payload_rules.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateEventConfig(index, (item) => {
                                  const newRules = item.payload_rules.filter((_, i) => i !== ruleIdx);
                                  return {
                                    ...item,
                                    payload_rules: newRules,
                                    payload_keys: newRules.map((r) => r.key),
                                    payload_types: newRules.map((r) => r.type),
                                  };
                                })
                              }
                              className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:text-rose-400 transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* STICKY SAVE BAR */}
          <div className="sticky bottom-6 z-40 rounded-2xl border border-zinc-800 bg-[#0c0e17]/95 p-4 backdrop-blur-md shadow-2xl flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Save all project settings & payload schemas.</span>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-xs font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50 shadow-md"
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* REAL CREDENTIALS MODAL (HIDDEN BY DEFAULT, OPENS ONLY ON BUTTON CLICK!) */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0e17] shadow-2xl space-y-5 p-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  <KeyRound size={18} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Project API Credentials</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Real unmasked values for integration & HMAC signing.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-xl border border-zinc-800 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Unmasked Real Keys & 1-Click Copy Buttons */}
            <div className="space-y-5">
              
              {/* API Key Row */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    API Key (X-API-KEY)
                  </label>
                  {copiedField === 'API Key' && (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <Check size={13} /> Real API Key Copied!
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-[#080910] p-2.5">
                  <input
                    type="text"
                    readOnly
                    className="w-full bg-transparent outline-none text-cyan-300 font-mono text-xs select-all px-2 border-none truncate"
                    value={generatedKeys?.api_key || 'Fetching real API key...'}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedKeys?.api_key, 'API Key')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-3.5 py-2 text-xs font-bold text-emerald-400 transition active:scale-95 shrink-0"
                  >
                    <Copy size={14} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              {/* Webhook Secret Key Row */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Webhook Secret Key
                  </label>
                  {copiedField === 'Webhook Secret' && (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <Check size={13} /> Real Secret Copied!
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-[#080910] p-2.5">
                  <input
                    type="text"
                    readOnly
                    className="w-full bg-transparent outline-none text-pink-300 font-mono text-xs select-all px-2 border-none truncate"
                    value={generatedKeys?.secret_key || 'Fetching real secret key...'}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedKeys?.secret_key, 'Webhook Secret')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-pink-500/40 bg-pink-500/20 hover:bg-pink-500/30 px-3.5 py-2 text-xs font-bold text-pink-300 transition active:scale-95 shrink-0"
                  >
                    <Copy size={14} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4 text-xs">
              <button
                type="button"
                onClick={handleRotateCredentials}
                disabled={generating}
                className="text-zinc-400 hover:text-amber-400 font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                <span>Rotate / Regenerate Keys</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-xl bg-zinc-800 hover:bg-zinc-700 px-5 py-2 font-bold text-white transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TEST WEBHOOK DISPATCHER MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0e17] shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 p-5 bg-[#121524]">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  <Zap size={16} />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase">Test Webhook Gateway Console</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="rounded-xl border border-zinc-800 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 p-6 max-h-[75vh] overflow-y-auto">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Event Type
                  </label>
                  <select
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2.5 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                    value={testEventType}
                    onChange={(e) => setTestEventType(e.target.value)}
                  >
                    {(form.eventConfigs || []).map((c, i) => (
                      <option key={i} value={c.event_type}>{c.event_type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Target Project Node
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2.5 text-xs font-mono text-zinc-400"
                    disabled
                    value={project?.name || ''}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    API Key (X-API-KEY)
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2.5 text-xs font-mono text-cyan-300 outline-none focus:border-emerald-400"
                    value={testApiKey}
                    onChange={(e) => setTestApiKey(e.target.value)}
                    placeholder="gw_live:..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    Webhook Secret (HMAC-SHA256)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2.5 text-xs font-mono text-pink-300 outline-none focus:border-emerald-400"
                    value={testSecretKey}
                    onChange={(e) => setTestSecretKey(e.target.value)}
                    placeholder="Secret Key..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Test Payload JSON
                </label>
                <textarea
                  className="min-h-36 w-full rounded-xl border border-zinc-800 bg-[#080910] p-3.5 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-400"
                  value={testPayloadStr}
                  onChange={(e) => setTestPayloadStr(e.target.value)}
                  placeholder='{ "event": "order.created", "amount": 99.99 }'
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={handleDispatchTestWebhook}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition active:scale-95 shadow-md"
                >
                  <Zap size={15} />
                  <span>{testLoading ? 'Dispatching...' : 'Dispatch Test Webhook'}</span>
                </button>
              </div>

              {testResult && (
                <div className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-[#080910] p-4 text-xs font-mono">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <span className="font-bold text-white">GATEWAY TEST EXECUTION RESULT</span>
                    <span className={`px-2.5 py-1 rounded-lg font-bold ${testResult.gateway_http_code < 400 || testResult.status === 'Gateway_Accepted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {testResult.gateway_http_code ? `HTTP ${testResult.gateway_http_code}` : testResult.status}
                    </span>
                  </div>

                  {testResult.generated_headers?.['X-HUB-SIGNATURE'] && (
                    <div className="text-[11px] pt-1">
                      <span className="text-zinc-500 font-bold">HMAC Signature: </span>
                      <span className="text-cyan-400 font-bold break-all">{testResult.generated_headers['X-HUB-SIGNATURE']}</span>
                    </div>
                  )}

                  <div className="pt-1">
                    <span className="text-zinc-500 font-bold">Gateway Response: </span>
                    <pre className="mt-1.5 max-h-40 overflow-y-auto rounded-xl bg-black/60 p-3.5 text-[11px] text-zinc-300">
                      {JSON.stringify(testResult.gateway_response || testResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </ProtectedLayout>
  );
}