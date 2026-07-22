import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Eye, 
  EyeOff, 
  KeyRound, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Database, 
  Copy, 
  AlertTriangle,
  Zap,
  ShieldCheck,
  Calendar,
  Save,
  Check
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';
import { createProjectPayload } from '@/utils/projectPayloads';

const blankForm = (project) => ({
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
    : [{ event_type: 'webhook.received', target_urls: ['https://example.com/webhook'], payload_rules: [{ key: 'event.id', type: 'string' }, { key: 'amount', type: 'number' }, { key: 'status', type: 'string' }], payload_keys: ['event.id', 'amount', 'status'], payload_types: ['string', 'number', 'string'] }],
  isActive: project?.is_active ?? true,
  retentionMode: project?.retention_mode || 'rolling_days',
  retentionDays: project?.retention_days ?? 30,
  deleteDate: project?.delete_date || '',
  deleteTime: project?.delete_time || '02:00',
  purgeEvents: true,
  purgeLogs: true,
});

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [form, setForm] = useState(blankForm(null));
  const [revealSecret, setRevealSecret] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  // Webhook Tester Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testApiKey, setTestApiKey] = useState('');
  const [testSecretKey, setTestSecretKey] = useState('');
  const [testEventType, setTestEventType] = useState('');
  const [testPayloadStr, setTestPayloadStr] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

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

      // Auto load credentials for this project
      try {
        const { data: keyData } = await apiClient.get(`/v1/projects/refresh_keys/${found.id}`);
        setGeneratedKeys({ api_key: keyData.api_key, secret_key: keyData.secret_key });
      } catch {
        // Ignore fallback
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to load project configuration.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [projectId, user?.email]);

  const handleCopy = async (text, label = 'Credential') => {
    if (!text || text.includes('•••')) {
      setFeedback({ type: 'error', message: 'Credentials key is not available. Please click Regenerate Credentials.' });
      return;
    }
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
      setFeedback({ type: 'success', message: `${label} copied to clipboard!` });
      setTimeout(() => setCopiedField(''), 3000);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to copy credential.' });
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
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

      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), payload);
      setProject((prev) => (prev ? { ...prev, ...updated, event_configs: prev.event_configs } : prev));
      setFeedback({ type: 'success', message: 'Project settings updated successfully.' });
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
    setFeedback({ type: 'success', message: `Project status updated to ${nextValue ? 'Active' : 'Paused'}.` });

    setToggling(true);
    try {
      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), { is_active: nextValue });
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
      setForm((prev) => ({ ...prev, isActive: updated.is_active ?? nextValue }));
    } catch (error) {
      setProject(previousProject);
      setForm((prev) => ({ ...prev, isActive: previousProject.is_active }));
      setFeedback({ type: 'error', message: error.message || 'Failed to update status.' });
    } finally {
      setToggling(false);
    }
  };

  const handleGenerateKeys = async () => {
    if (!project) return;

    setGenerating(true);
    setFeedback({ type: '', message: '' });

    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
      setGeneratedKeys({ api_key: data.api_key, secret_key: data.secret_key });
      setRevealSecret(true);
      setFeedback({ type: 'success', message: 'API Credentials regenerated successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to refresh API keys.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!project || !window.confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
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
      try {
        const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
        setGeneratedKeys({ api_key: data.api_key, secret_key: data.secret_key });
        setTestApiKey(data.api_key);
        setTestSecretKey(data.secret_key);
      } catch {
        // Ignore
      }
    }
  };

  const handleDispatchTestWebhook = async () => {
    if (!testApiKey || !testSecretKey) {
      alert('API Key and Secret Key are required to send a test webhook.');
      return;
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(testPayloadStr);
    } catch {
      alert('Invalid JSON in test payload field. Please enter valid JSON.');
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

  if (loading) {
    return (
      <ProtectedLayout title="Loading Project..." eyebrow="Projects">
        <div className="flex h-64 items-center justify-center text-sm font-medium text-zinc-400">
          Loading project settings...
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title={project?.name || 'Project Details'} eyebrow="Project Management">
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        
        {/* Compact Header Panel */}
        <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <button 
                type="button" 
                onClick={() => navigate('/projects')} 
                className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-emerald-400 transition duration-150"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Projects
              </button>
              
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  {project?.name || 'Project Details'}
                </h1>
                
                {/* Single Header Toggle Switch */}
                <div className="flex items-center gap-2.5 rounded-full border border-zinc-800 bg-[#080910] px-3.5 py-1.5">
                  <span className={`text-xs font-semibold ${form.isActive ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {form.isActive ? 'Active' : 'Paused'}
                  </span>
                  <button
                    type="button"
                    disabled={toggling}
                    onClick={handleToggleActive}
                    className={`relative h-5 w-9 rounded-full p-0.5 transition ${form.isActive ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    title={form.isActive ? 'Pause Project' : 'Activate Project'}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition ${form.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <p className="max-w-2xl text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Configure webhook event routing, payload validation rules, data retention schedules, and API credentials.
              </p>
            </div>
            
            {/* Top Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button 
                type="button" 
                onClick={handleOpenTestModal} 
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-bold text-zinc-950 transition active:scale-95 shadow-md"
              >
                <Zap className="h-4 w-4" />
                Test Webhook
              </button>

              <button 
                type="button" 
                onClick={() => navigate(`/projects/${projectId}/logs`)} 
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#141522] hover:bg-[#1a1c2e] px-4 py-2.5 text-xs font-semibold text-zinc-200 transition active:scale-95"
              >
                <Database className="h-4 w-4 text-cyan-400" />
                System Logs
              </button>

              <button 
                type="button" 
                onClick={handleDelete} 
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2.5 text-xs font-semibold text-rose-400 transition active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
                Delete Project
              </button>
            </div>
          </div>
        </section>

        {/* Feedback Alert Banner */}
        {feedback.message && (
          <div className={`rounded-2xl px-5 py-3.5 text-xs font-semibold flex items-center gap-2.5 ${feedback.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            {feedback.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          
          {/* Section 1: Project Details & API Credentials Panel */}
          <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="border-b border-zinc-800/80 pb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  Project Information & API Credentials
                </h2>
                <p className="mt-1 text-xs text-zinc-400">Configure basic project information and manage API authentication credentials.</p>
              </div>

              <button
                type="button"
                disabled={generating}
                onClick={handleGenerateKeys}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-[#161724] hover:bg-[#1e2032] px-4 py-2 text-xs font-semibold text-zinc-200 transition active:scale-95 shadow-sm shrink-0"
              >
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <span>{generating ? 'Regenerating...' : 'Regenerate Credentials'}</span>
              </button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-300">Project Name</label>
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-emerald-400"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Stripe Payment Gateways"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-300">Description</label>
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-2.5 text-xs sm:text-sm text-zinc-200 outline-none focus:border-emerald-400"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional project description..."
                />
              </div>
            </div>

            {/* API Credentials Box */}
            {generatedKeys && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    Active Project API Credentials
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* API Key */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-400">API Key (X-API-KEY)</label>
                      {copiedField === 'API Key' && (
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                          <Check size={12} /> Copied to clipboard!
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-[#080910] p-2.5 text-xs font-mono text-cyan-300">
                      <input
                        type="text"
                        readOnly
                        className="w-full bg-transparent outline-none text-cyan-300 font-mono text-xs select-all border-none focus:ring-0 truncate"
                        value={generatedKeys.api_key || ''}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedKeys.api_key, 'API Key')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#141522] hover:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition active:scale-95 shrink-0"
                      >
                        <Copy size={13} />
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Secret Key */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-400">Webhook Signing Secret</label>
                      {copiedField === 'Webhook Secret' && (
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                          <Check size={12} /> Copied to clipboard!
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-[#080910] p-2.5 text-xs font-mono text-pink-300">
                      <input
                        type={revealSecret ? 'text' : 'password'}
                        readOnly
                        className="w-full bg-transparent outline-none text-pink-300 font-mono text-xs select-all border-none focus:ring-0 truncate"
                        value={generatedKeys.secret_key || ''}
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(generatedKeys.secret_key, 'Webhook Secret')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#141522] hover:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition active:scale-95"
                        >
                          <Copy size={13} />
                          <span>Copy</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevealSecret((prev) => !prev)}
                          className="rounded-lg border border-zinc-800 bg-[#141522] hover:bg-zinc-800 p-2 text-zinc-300 transition active:scale-95"
                          title={revealSecret ? 'Hide Secret' : 'Reveal Secret'}
                        >
                          {revealSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Compact Data Retention & Automated Log Cleanup Policy */}
          <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-400" />
                  Data Retention & Auto-Cleanup Policy
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Configure project-wide retention mode. Old webhook event payloads and execution logs are automatically purged on schedule.
                </p>
              </div>

              {/* Retention Mode Tabs */}
              <div className="flex items-center gap-1 rounded-xl bg-[#080910] p-1 border border-zinc-800 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'rolling_days' }))}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${form.retentionMode === 'rolling_days' ? 'bg-emerald-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                >
                  Auto Rolling Days
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, retentionMode: 'specific_date' }))}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${form.retentionMode === 'specific_date' ? 'bg-emerald-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                >
                  Specific Target Date & Hour
                </button>
              </div>
            </div>

            {form.retentionMode === 'rolling_days' ? (
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Retention Period (Days) */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-zinc-300">Rolling Expiration Period</label>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {[3, 7, 14, 30, 90, 365].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, retentionDays: days }))}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${form.retentionDays === days ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[#080910] border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                      >
                        {days} Days
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        className="w-20 rounded-xl border border-zinc-800 bg-[#080910] px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-emerald-400"
                        value={form.retentionDays || ''}
                        onChange={(e) => setForm((prev) => ({ ...prev, retentionDays: parseInt(e.target.value) || 30 }))}
                      />
                      <span className="text-xs text-zinc-400">days</span>
                    </div>
                  </div>
                </div>

                {/* Scheduled Daily Deletion Time */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-zinc-300">Scheduled Daily Cleanup Time</label>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { label: '12 AM', value: '00:00' },
                      { label: '2 AM (Off-peak)', value: '02:00' },
                      { label: '4 AM', value: '04:00' },
                      { label: '6 AM', value: '06:00' },
                      { label: '12 PM', value: '12:00' },
                    ].map((timeOption) => (
                      <button
                        key={timeOption.value}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, deleteTime: timeOption.value }))}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${form.deleteTime === timeOption.value ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[#080910] border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                      >
                        {timeOption.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Specific Target Date */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">Specific Target Expiration Date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-2.5 text-xs font-mono text-white outline-none focus:border-emerald-400"
                    value={form.deleteDate || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, deleteDate: e.target.value }))}
                  />
                  <p className="text-[11px] text-zinc-500">Log entries created before this date will be purged automatically at the target hour.</p>
                </div>

                {/* Specific Purge Hour */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">Exact Purge Hour</label>
                  <select
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-2.5 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
                    value={form.deleteTime || '02:00'}
                    onChange={(e) => setForm((prev) => ({ ...prev, deleteTime: e.target.value }))}
                  >
                    <option value="00:00">12:00 AM (Midnight)</option>
                    <option value="02:00">02:00 AM (Off-peak)</option>
                    <option value="04:00">04:00 AM</option>
                    <option value="06:00">06:00 AM</option>
                    <option value="12:00">12:00 PM (Noon)</option>
                    <option value="18:00">06:00 PM</option>
                    <option value="21:00">09:00 PM</option>
                  </select>
                  <p className="text-[11px] text-zinc-500">Purge runs at this specific hour on the target date.</p>
                </div>
              </div>
            )}

            {/* Target Data Scope Checkboxes */}
            <div className="rounded-2xl border border-zinc-800/80 bg-[#080910] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-300">
              <span className="font-semibold text-zinc-400">Purge Target Scope:</span>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.purgeEvents}
                    onChange={(e) => setForm((prev) => ({ ...prev, purgeEvents: e.target.checked }))}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  <span>Webhook Ingress Payloads</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.purgeLogs}
                    onChange={(e) => setForm((prev) => ({ ...prev, purgeLogs: e.target.checked }))}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  <span>Execution & Forwarding Logs</span>
                </label>
              </div>
            </div>
          </section>

          {/* Section 3: Event Routing & Payload Schema Builder */}
          <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Event Routing & Payload Schema Validation</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Configure target destination URLs and mandatory payload key & data type requirements for each event type.
                </p>
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
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition active:scale-95"
              >
                <Plus size={14} />
                <span>Add Event Rule</span>
              </button>
            </div>

            <div className="space-y-6">
              {form.eventConfigs.map((config, index) => (
                <div key={index} className="rounded-2xl border border-zinc-800 bg-[#080910] p-6 space-y-5">
                  {/* Event Header */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="space-y-1 flex-1 max-w-sm">
                        <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Event Type Name</label>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-[#0c0d15] px-3.5 py-2 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-400"
                          value={config.event_type}
                          onChange={(e) =>
                            updateEventConfig(index, (item) => ({ ...item, event_type: e.target.value }))
                          }
                          placeholder="e.g. order.created"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 font-medium">{config.is_active ? 'Active' : 'Disabled'}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateEventConfig(index, (item) => ({ ...item, is_active: !item.is_active }))
                          }
                          className={`relative h-6 w-11 rounded-full p-0.5 transition ${config.is_active ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                          <span className={`block h-5 w-5 rounded-full bg-white transition ${config.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
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
                          className="rounded-xl border border-zinc-800 p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Remove Event Rule"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Destination Target URLs */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-zinc-300">Destination Forwarding URLs</label>
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
                        <Plus size={12} /> Add Destination URL
                      </button>
                    </div>

                    <div className="space-y-2">
                      {config.target_urls.map((url, urlIdx) => (
                        <div key={urlIdx} className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-xl border border-zinc-800 bg-[#0c0d15] px-3.5 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
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
                              className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Payload Keys & Required Data Types Builder */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300">Payload Schema Validation Rules</label>
                        <p className="text-[11px] text-zinc-500">Incoming payloads must contain these keys and match the expected data type.</p>
                      </div>
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
                        <Plus size={12} /> Add Payload Rule
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(config.payload_rules || []).map((rule, ruleIdx) => (
                        <div key={ruleIdx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-xl border border-zinc-800/80 bg-[#0c0d15] p-2.5">
                          <div className="flex-1">
                            <input
                              className="w-full rounded-lg border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-400"
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
                              placeholder="Key path (e.g. amount, status, user.id)"
                            />
                          </div>

                          <div className="w-full sm:w-40">
                            <select
                              className="w-full rounded-lg border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-400"
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
                          </div>

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
                              className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:text-rose-400 self-end sm:self-auto"
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
          <div className="sticky bottom-6 z-40 rounded-2xl border border-zinc-800 bg-[#0c0d15]/90 p-4 backdrop-blur-md shadow-2xl flex items-center justify-between">
            <div className="text-xs text-zinc-400">
              Review destination URLs and payload rules before saving.
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-2.5 text-xs font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50 shadow-md"
            >
              <Save size={16} />
              <span>{saving ? 'Saving Changes...' : 'Save Project Settings'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* TEST WEBHOOK DISPATCHER MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0d15] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-5 bg-[#10121d]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Zap size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">Test Webhook Gateway Dispatcher</h3>
                  <p className="text-[11px] text-zinc-400">Sends live signed test payload to POST /v1/gateway</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="rounded-xl border border-zinc-800 p-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
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
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2 text-xs font-mono text-zinc-400"
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
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2 text-xs font-mono text-cyan-300 outline-none focus:border-emerald-400"
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
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3.5 py-2 text-xs font-mono text-pink-300 outline-none focus:border-emerald-400"
                    value={testSecretKey}
                    onChange={(e) => setTestSecretKey(e.target.value)}
                    placeholder="Secret Key..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Test Webhook Payload JSON
                </label>
                <textarea
                  className="min-h-36 w-full rounded-xl border border-zinc-800 bg-[#080910] p-3 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-400"
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