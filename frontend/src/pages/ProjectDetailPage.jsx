import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Eye, 
  EyeOff, 
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
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Sliders
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
    // Time & Retention Schedule Modes
    retentionMode: project?.retention_mode || metadata?.retention_mode || 'preset_days',
    retentionDays: project?.retention_days ?? 7,
    deleteDate: project?.delete_date || metadata?.delete_date || '',
    deleteTime: project?.delete_time || metadata?.delete_time || '02:00',
    intervalUnit: metadata?.interval_unit || 'hours', // 'seconds' | 'minutes' | 'hours' | 'days'
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
  
  // Real Credentials State (Unmasked)
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [revealSecret, setRevealSecret] = useState(true); // Default true so user sees real values without dots
  const [copiedField, setCopiedField] = useState('');

  // Form State
  const [form, setForm] = useState(blankForm(null));
  
  // Dynamic Option Dropdown State for Schedule Time Settings
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);

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

      // Fetch unmasked real keys
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

  const handleOpenCredentialsModal = async () => {
    setShowCredentialsModal(true);
    if (!generatedKeys?.api_key || !generatedKeys?.secret_key) {
      await fetchCredentials(project?.id || projectId);
    }
  };

  const handleCopy = async (text, label = 'Credential') => {
    let copyVal = text;

    // If text is missing or contains dots placeholder, fetch real keys first!
    if (!copyVal || copyVal.includes('•••')) {
      const data = await fetchCredentials(project.id);
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
      setFeedback({ type: 'success', message: `✓ Real ${label} copied to clipboard!` });
      setTimeout(() => setCopiedField(''), 3000);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to copy.' });
    }
  };

  const handleSave = async (event) => {
    if (event) event.preventDefault();
    if (!project) return;

    setSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const payload = createProjectPayload({
        name: form.name,
        description: form.description,
        eventConfigs: form.eventConfigs,
        isActive: form.isActive,
        retentionMode: form.retentionMode,
        retentionDays: form.retentionDays,
        deleteDate: form.deleteDate,
        deleteTime: form.deleteTime,
      });

      // Save additional schedule metadata
      payload.metadata_json = {
        ...(project.metadata_json || {}),
        retention_mode: form.retentionMode,
        interval_unit: form.intervalUnit,
        interval_value: form.intervalValue,
        day_of_week: form.dayOfWeek,
        delete_date: form.deleteDate,
        delete_time: form.deleteTime,
      };

      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), payload);
      setProject((prev) => (prev ? { ...prev, ...updated, event_configs: prev.event_configs } : prev));
      setFeedback({ type: 'success', message: '✓ Project details & schedule saved successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to save project details.' });
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
    if (!project || !window.confirm('Are you sure you want to regenerate API Credentials? Any existing applications using the old credentials will need to be updated.')) {
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

  // Helper text for current schedule summary
  const getScheduleSummary = () => {
    if (form.retentionMode === 'preset_days' || form.retentionMode === 'rolling_days') {
      return `${form.retentionDays} Days Rolling Retention (Cleanup @ ${form.deleteTime || '02:00'})`;
    }
    if (form.retentionMode === 'custom_interval') {
      return `Every ${form.intervalValue} ${form.intervalUnit} schedule`;
    }
    if (form.retentionMode === 'specific_date') {
      return `Specific Expiration Date: ${form.deleteDate || 'Not set'} @ ${form.deleteTime || '02:00'}`;
    }
    if (form.retentionMode === 'specific_day') {
      return `Weekly on ${form.dayOfWeek.toUpperCase()} @ ${form.deleteTime || '02:00'}`;
    }
    return `${form.retentionDays} Days Retention`;
  };

  if (loading) {
    return (
      <ProtectedLayout title="Loading Project Details..." eyebrow="Projects">
        <div className="flex h-64 items-center justify-center text-xs font-semibold text-zinc-400">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin text-emerald-400" />
          Loading project details & credentials…
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title={project?.name || 'Project Details'} eyebrow="Project Management">
      <div className="max-w-6xl mx-auto space-y-5 py-2">
        
        {/* Header Panel */}
        <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-5 shadow-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <button 
                type="button" 
                onClick={() => navigate('/projects')} 
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-emerald-400 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Projects
              </button>
              
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {project?.name || 'Project Details'}
                </h1>
                
                {/* Active/Paused Switch */}
                <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-[#080910] px-3 py-1 text-xs">
                  <span className={`font-semibold ${form.isActive ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {form.isActive ? 'Active' : 'Paused'}
                  </span>
                  <button
                    type="button"
                    disabled={toggling}
                    onClick={handleToggleActive}
                    className={`relative h-4.5 w-8 rounded-full p-0.5 transition ${form.isActive ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${form.isActive ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Header Action Buttons (Compact & Feature-rich) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Credentials Trigger Button (Does not consume page height!) */}
              <button 
                type="button" 
                onClick={handleOpenCredentialsModal} 
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-400 transition active:scale-95 shadow-sm"
              >
                <KeyRound className="h-3.5 w-3.5" />
                API Credentials
              </button>

              <button 
                type="button" 
                onClick={handleOpenTestModal} 
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-2 text-xs font-bold text-zinc-950 transition active:scale-95 shadow-md"
              >
                <Zap className="h-3.5 w-3.5" />
                Test Webhook
              </button>

              <button 
                type="button" 
                onClick={() => navigate(`/projects/${projectId}/logs`)} 
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#141522] hover:bg-[#1a1c2e] px-3.5 py-2 text-xs font-semibold text-zinc-200 transition active:scale-95"
              >
                <Database className="h-3.5 w-3.5 text-cyan-400" />
                Logs
              </button>

              <button 
                type="button" 
                onClick={handleDelete} 
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 px-3.5 py-2 text-xs font-semibold text-rose-400 transition active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        </section>

        {/* Feedback Alert Toast */}
        {feedback.message && (
          <div className={`rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 shadow-md ${feedback.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="hover:opacity-75">
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          
          {/* Card 1: Project Identity & Basic Info (CRUD) */}
          <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Project Details (CRUD)
              </h2>
              <span className="text-[11px] font-mono text-zinc-500">ID: #{project?.id}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-zinc-300">Project Name</label>
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs text-white outline-none focus:border-emerald-400 transition"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Payment Webhook Gateway"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-zinc-300">Description</label>
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 transition"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional project description..."
                />
              </div>
            </div>
          </section>

          {/* Card 2: Time Set & Retention Schedule (PROGRESSIVE DISCLOSURE UI - Clean & Compact!) */}
          <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-5 shadow-xl space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  Time & Data Retention Schedule
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Current Schedule: <span className="font-mono text-emerald-400 font-semibold">{getScheduleSummary()}</span>
                </p>
              </div>

              {/* Select Button to Reveal Dynamic Options */}
              <button
                type="button"
                onClick={() => setShowScheduleOptions((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-3.5 py-1.5 text-xs font-bold text-cyan-300 transition active:scale-95 shrink-0"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>{showScheduleOptions ? 'Hide Schedule Options' : 'Configure Schedule Options'}</span>
                {showScheduleOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* DYNAMIC EXPANDABLE OPTIONS PANEL (Opens only when user clicks/selects option!) */}
            {showScheduleOptions && (
              <div className="rounded-2xl border border-zinc-800 bg-[#080910] p-4 space-y-4 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Select Schedule & Purge Mode
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'preset_days' }))}
                      className={`rounded-xl p-2.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'preset_days' || form.retentionMode === 'rolling_days' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-[#0c0d15] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold">🔄 Preset Days</div>
                      <div className="text-[10px] opacity-75">7, 14, 30, 90 Days...</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'custom_interval' }))}
                      className={`rounded-xl p-2.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'custom_interval' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-[#0c0d15] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold">⏱️ Custom Interval</div>
                      <div className="text-[10px] opacity-75">Every X hrs/mins/sec</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'specific_date' }))}
                      className={`rounded-xl p-2.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'specific_date' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-[#0c0d15] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold">📅 Specific Date</div>
                      <div className="text-[10px] opacity-75">Target Date & Hour</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'specific_day' }))}
                      className={`rounded-xl p-2.5 text-xs font-semibold border text-left transition ${form.retentionMode === 'specific_day' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-[#0c0d15] text-zinc-400 hover:border-zinc-700'}`}
                    >
                      <div className="font-bold">🗓️ Day of Week</div>
                      <div className="text-[10px] opacity-75">Every Mon/Fri etc.</div>
                    </button>
                  </div>
                </div>

                {/* MODE SUB-OPTIONS */}
                {(form.retentionMode === 'preset_days' || form.retentionMode === 'rolling_days') && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-zinc-800/60">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Retention Period (Days)</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-400"
                        value={form.retentionDays}
                        onChange={(e) => setForm((prev) => ({ ...prev, retentionDays: parseInt(e.target.value) || 7 }))}
                      >
                        <option value={1}>1 Day Retention</option>
                        <option value={3}>3 Days Retention</option>
                        <option value={7}>7 Days Retention (Default)</option>
                        <option value={14}>14 Days Retention</option>
                        <option value={30}>30 Days Retention</option>
                        <option value={90}>90 Days Retention</option>
                        <option value={365}>365 Days Retention</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Daily Execution Hour</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                        value={form.deleteTime || '02:00'}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteTime: e.target.value }))}
                      >
                        <option value="00:00">12:00 AM (Midnight)</option>
                        <option value="02:00">02:00 AM (Off-peak standard)</option>
                        <option value="04:00">04:00 AM</option>
                        <option value="06:00">06:00 AM</option>
                        <option value="12:00">12:00 PM (Noon)</option>
                        <option value="18:00">06:00 PM</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.retentionMode === 'custom_interval' && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-zinc-800/60">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Repeat Interval Amount</label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-400"
                        value={form.intervalValue}
                        onChange={(e) => setForm((prev) => ({ ...prev, intervalValue: Math.max(1, parseInt(e.target.value) || 1) }))}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Time Unit</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                        value={form.intervalUnit}
                        onChange={(e) => setForm((prev) => ({ ...prev, intervalUnit: e.target.value }))}
                      >
                        <option value="seconds">Every X Seconds</option>
                        <option value="minutes">Every X Minutes</option>
                        <option value="hours">Every X Hours (e.g. Every 1 Hour)</option>
                        <option value="days">Every X Days (e.g. Every 7 Days)</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.retentionMode === 'specific_date' && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-zinc-800/60">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Target Expiration Date</label>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-white outline-none focus:border-emerald-400"
                        value={form.deleteDate || ''}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteDate: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Purge Hour</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                        value={form.deleteTime || '02:00'}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteTime: e.target.value }))}
                      >
                        <option value="00:00">12:00 AM (Midnight)</option>
                        <option value="02:00">02:00 AM</option>
                        <option value="06:00">06:00 AM</option>
                        <option value="12:00">12:00 PM (Noon)</option>
                        <option value="18:00">06:00 PM</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.retentionMode === 'specific_day' && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-zinc-800/60">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Day of Week</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-400"
                        value={form.dayOfWeek}
                        onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))}
                      >
                        <option value="monday">Every Monday</option>
                        <option value="tuesday">Every Tuesday</option>
                        <option value="wednesday">Every Wednesday</option>
                        <option value="thursday">Every Thursday</option>
                        <option value="friday">Every Friday</option>
                        <option value="saturday">Every Saturday</option>
                        <option value="sunday">Every Sunday</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-300">Execution Hour</label>
                      <select
                        className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                        value={form.deleteTime || '02:00'}
                        onChange={(e) => setForm((prev) => ({ ...prev, deleteTime: e.target.value }))}
                      >
                        <option value="00:00">12:00 AM (Midnight)</option>
                        <option value="02:00">02:00 AM</option>
                        <option value="06:00">06:00 AM</option>
                        <option value="12:00">12:00 PM (Noon)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Scope & Purge Action Row */}
                <div className="rounded-xl border border-zinc-800/80 bg-[#0c0d15] p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-300">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-zinc-400 text-[11px]">Purge Target Scope:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={form.purgeEvents}
                        onChange={(e) => setForm((prev) => ({ ...prev, purgeEvents: e.target.checked }))}
                        className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono text-cyan-300">`webhook_events`</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={form.purgeLogs}
                        onChange={(e) => setForm((prev) => ({ ...prev, purgeLogs: e.target.checked }))}
                        className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono text-cyan-300">`webhook_logs`</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={purging}
                    onClick={handlePurgeNow}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-400 transition shrink-0"
                  >
                    <Trash2 size={13} />
                    <span>{purging ? 'Purging...' : 'Purge Data Now'}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Card 3: Event Routing & Payload Schema Rules (CRUD) */}
          <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-5 shadow-xl space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">Event Routing & Payload Schema Rules</h2>
                <p className="text-xs text-zinc-400">Configure webhook destination URLs and expected payload fields.</p>
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition active:scale-95 shrink-0"
              >
                <Plus size={13} />
                <span>Add Event Rule</span>
              </button>
            </div>

            <div className="space-y-4">
              {form.eventConfigs.map((config, index) => (
                <div key={index} className="rounded-2xl border border-zinc-800 bg-[#080910] p-4 space-y-3">
                  {/* Event Header */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-2">
                    <div className="flex items-center gap-2 flex-1 max-w-xs">
                      <input
                        className="w-full rounded-lg border border-zinc-800 bg-[#0c0d15] px-3 py-1.5 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-400"
                        value={config.event_type}
                        onChange={(e) =>
                          updateEventConfig(index, (item) => ({ ...item, event_type: e.target.value }))
                        }
                        placeholder="e.g. order.created"
                        required
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-400">{config.is_active ? 'Active' : 'Disabled'}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateEventConfig(index, (item) => ({ ...item, is_active: !item.is_active }))
                          }
                          className={`relative h-4.5 w-8 rounded-full p-0.5 transition ${config.is_active ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                          <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${config.is_active ? 'translate-x-3.5' : 'translate-x-0'}`} />
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
                          className="rounded-lg border border-zinc-800 p-1 text-zinc-400 hover:text-rose-400"
                          title="Remove Event Rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Destination URLs */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-300">Destination URLs</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateEventConfig(index, (item) => ({
                            ...item,
                            target_urls: [...item.target_urls, 'https://example.com/webhook'],
                          }))
                        }
                        className="text-[11px] font-semibold text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <Plus size={11} /> Add URL
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {config.target_urls.map((url, urlIdx) => (
                        <div key={urlIdx} className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-xl border border-zinc-800 bg-[#0c0d15] px-3 py-1.5 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
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
                              className="rounded-lg border border-zinc-800 p-1 text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payload Keys & Data Types Builder */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-300">Payload Schema Rules</span>
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
                        className="text-[11px] font-semibold text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <Plus size={11} /> Add Key Rule
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {(config.payload_rules || []).map((rule, ruleIdx) => (
                        <div key={ruleIdx} className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-[#0c0d15] p-1.5">
                          <input
                            className="flex-1 rounded-lg border border-zinc-800 bg-[#080910] px-2.5 py-1 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-400"
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
                            className="w-32 rounded-lg border border-zinc-800 bg-[#080910] px-2.5 py-1 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-400"
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
                              className="rounded-lg border border-zinc-800 p-1 text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 size={12} />
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

          {/* Sticky Bottom Save Bar */}
          <div className="sticky bottom-6 z-40 rounded-2xl border border-zinc-800 bg-[#0c0d15]/90 p-3.5 backdrop-blur-md shadow-2xl flex items-center justify-between">
            <span className="text-xs text-zinc-400">Save project details & schema configuration.</span>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-xs font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50 shadow-md"
            >
              <Save size={15} />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* CREDENTIALS MODAL (COMPACT & REAL VALUES COPYING - DOES NOT BLOAT PAGE!) */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0d15] shadow-2xl space-y-4 p-5">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <KeyRound size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Project API Credentials</h3>
                  <p className="text-[11px] text-zinc-400">Real values for gateway ingestion & HMAC signing.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-xl border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body: Unmasked Real Keys & Single Click Copy Buttons */}
            <div className="space-y-4">
              
              {/* API KEY ROW */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">API Key (X-API-KEY)</span>
                  {copiedField === 'API Key' && (
                    <span className="font-bold text-emerald-400 flex items-center gap-1 text-[11px]">
                      <Check size={12} /> Real Key Copied!
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#080910] p-2">
                  <input
                    type="text"
                    readOnly
                    className="w-full bg-transparent outline-none text-cyan-300 font-mono text-xs select-all border-none focus:ring-0 truncate"
                    value={generatedKeys?.api_key || 'Fetching real API key...'}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedKeys?.api_key, 'API Key')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-400 transition active:scale-95 shrink-0"
                  >
                    <Copy size={13} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              {/* WEBHOOK SECRET ROW */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Webhook Secret Key</span>
                  {copiedField === 'Webhook Secret' && (
                    <span className="font-bold text-emerald-400 flex items-center gap-1 text-[11px]">
                      <Check size={12} /> Real Secret Copied!
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#080910] p-2">
                  <input
                    type={revealSecret ? 'text' : 'password'}
                    readOnly
                    className="w-full bg-transparent outline-none text-pink-300 font-mono text-xs select-all border-none focus:ring-0 truncate"
                    value={generatedKeys?.secret_key || 'Fetching real secret key...'}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealSecret((prev) => !prev)}
                    className="rounded-xl border border-zinc-800 bg-[#141522] hover:bg-zinc-800 p-1.5 text-zinc-300 transition shrink-0"
                    title={revealSecret ? "Mask with dots" : "Show real characters"}
                  >
                    {revealSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedKeys?.secret_key, 'Webhook Secret')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-pink-500/30 bg-pink-500/20 hover:bg-pink-500/30 px-3 py-1.5 text-xs font-bold text-pink-300 transition active:scale-95 shrink-0"
                  >
                    <Copy size={13} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs">
              <button
                type="button"
                onClick={handleRotateCredentials}
                disabled={generating}
                className="text-zinc-400 hover:text-amber-400 font-semibold flex items-center gap-1"
              >
                <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                <span>Rotate / Regenerate Keys</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 font-bold text-white transition"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TEST WEBHOOK DISPATCHER MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0d15] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-4 bg-[#10121d]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Zap size={15} />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase">Test Webhook Gateway Console</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="rounded-xl border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 p-5 max-h-[75vh] overflow-y-auto">
              
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Event Type
                  </label>
                  <select
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                    value={testEventType}
                    onChange={(e) => setTestEventType(e.target.value)}
                  >
                    {(form.eventConfigs || []).map((c, i) => (
                      <option key={i} value={c.event_type}>{c.event_type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Target Project Node
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs font-mono text-zinc-400"
                    disabled
                    value={project?.name || ''}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    API Key (X-API-KEY)
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs font-mono text-cyan-300 outline-none focus:border-emerald-400"
                    value={testApiKey}
                    onChange={(e) => setTestApiKey(e.target.value)}
                    placeholder="gw_live:..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Webhook Secret (HMAC-SHA256)
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs font-mono text-pink-300 outline-none focus:border-emerald-400"
                    value={testSecretKey}
                    onChange={(e) => setTestSecretKey(e.target.value)}
                    placeholder="Secret Key..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Test Payload JSON
                </label>
                <textarea
                  className="min-h-32 w-full rounded-xl border border-zinc-800 bg-[#080910] p-3 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-400"
                  value={testPayloadStr}
                  onChange={(e) => setTestPayloadStr(e.target.value)}
                  placeholder='{ "event": "order.created", "amount": 99.99 }'
                />
              </div>

              <div className="flex justify-end gap-2">
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition active:scale-95 shadow-md"
                >
                  <Zap size={14} />
                  <span>{testLoading ? 'Dispatching...' : 'Dispatch Test Webhook'}</span>
                </button>
              </div>

              {testResult && (
                <div className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-[#080910] p-4 text-xs font-mono">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <span className="font-bold text-white">GATEWAY TEST EXECUTION RESULT</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${testResult.gateway_http_code < 400 || testResult.status === 'Gateway_Accepted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {testResult.gateway_http_code ? `HTTP ${testResult.gateway_http_code}` : testResult.status}
                    </span>
                  </div>

                  {testResult.generated_headers?.['X-HUB-SIGNATURE'] && (
                    <div className="text-[11px]">
                      <span className="text-zinc-500 font-bold">HMAC Signature: </span>
                      <span className="text-cyan-400 font-bold break-all">{testResult.generated_headers['X-HUB-SIGNATURE']}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-zinc-500 font-bold">Gateway Response: </span>
                    <pre className="mt-1 max-h-36 overflow-y-auto rounded-xl bg-black/60 p-3 text-[11px] text-zinc-300">
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