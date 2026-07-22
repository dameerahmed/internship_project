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
  Settings, 
  Database, 
  Layers, 
  ExternalLink,
  Copy,
  AlertTriangle,
  Zap
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
          retention_days: config.retention_days ?? null,
          delete_time: config.delete_time ?? '',
          id: config.id,
          is_active: config.is_active ?? true,
        };
      })
    : [{ event_type: 'webhook.received', target_urls: ['https://example.com/webhook'], payload_rules: [{ key: 'event.id', type: 'string' }, { key: 'amount', type: 'number' }, { key: 'status', type: 'string' }], payload_keys: ['event.id', 'amount', 'status'], payload_types: ['string', 'number', 'string'], retention_days: null, delete_time: '' }],
  isActive: project?.is_active ?? true,
  retentionDays: project?.retention_days ?? 30,
  deleteTime: project?.delete_time ?? '',
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
  const [timeLeft, setTimeLeft] = useState(0);

  // Webhook Tester State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testApiKey, setTestApiKey] = useState('');
  const [testSecretKey, setTestSecretKey] = useState('');
  const [testEventType, setTestEventType] = useState('');
  const [testPayloadStr, setTestPayloadStr] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
  
  const clearTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const loadProject = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: found } = await apiClient.get(API_ENDPOINTS.PROJECTS.GET(projectId));

      if (!found) {
        setFeedback({ type: 'error', message: 'Project targeted endpoint not found.' });
        setProject(null);
        return;
      }

      setProject(found);
      setForm(blankForm(found));
      sessionStorage.setItem('selectedProjectId', String(found.id));
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to load project node configuration.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
    };
  }, [projectId, user?.email]);

  const triggerCredentialsTimer = () => {
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);

    const seconds = 15;
    setTimeLeft(seconds);

    countdownIntervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    clearTimerRef.current = window.setTimeout(() => {
      setGeneratedKeys(null);
      setRevealSecret(false);
      setFeedback({ type: '', message: '' });
    }, seconds * 1000);
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
        retentionDays: form.retentionDays,
        deleteTime: form.deleteTime,
      });

      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), payload);
      setProject((prev) => (prev ? { ...prev, ...updated, event_configs: prev.event_configs } : prev));
      setFeedback({ type: 'success', message: 'Pipeline network settings deployed.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Deployment of settings rejected by gateway.' });
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
    setFeedback({ type: 'success', message: `Data pipeline successfully ${nextValue ? 'activated' : 'paused'}.` });

    setToggling(true);
    try {
      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), { is_active: nextValue });
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
      setForm((prev) => ({ ...prev, isActive: updated.is_active ?? nextValue }));
    } catch (error) {
      setProject(previousProject);
      setForm((prev) => ({ ...prev, isActive: previousProject.is_active }));
      setFeedback({ type: 'error', message: error.message || 'State modification rejected.' });
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
      setRevealSecret(false);
      triggerCredentialsTimer();
      setFeedback({ type: 'success', message: 'Keys refreshed. Copy within buffer time.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Key refreshing failed.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!project || !window.confirm('WARNING: Destroy project node configuration along with routing maps?')) {
      return;
    }

    try {
      await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(project.id));
      sessionStorage.removeItem('selectedProjectId');
      navigate('/projects');
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Gateway deletion handshake failed.' });
    }
  };

  const handleToggleEvent = async (eventId, currentValue, index) => {
    if (!project) return;

    const nextValue = !currentValue;
    const previousProject = project;

    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        event_configs: prev.event_configs.map((ec) => (ec.id === eventId ? { ...ec, is_active: nextValue } : ec)),
      };
    });
    setForm((prev) => ({
      ...prev,
      eventConfigs: prev.eventConfigs.map((ec, idx) => (idx === index ? { ...ec, is_active: nextValue } : ec)),
    }));

    if (!eventId) {
      setFeedback({ type: 'success', message: 'Event status updated locally. Save to persist it.' });
      return;
    }

    setToggling(true);
    try {
      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.EVENT_UPDATE(project.id, eventId), { is_active: nextValue });
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          event_configs: prev.event_configs.map((ec) => (ec.id === eventId ? { ...ec, is_active: updated.is_active } : ec)),
        };
      });
      setForm((prev) => ({
        ...prev,
        eventConfigs: prev.eventConfigs.map((ec, idx) => (idx === index ? { ...ec, is_active: updated.is_active ?? nextValue } : ec)),
      }));
      setFeedback({ type: 'success', message: `Event routing gateway ${updated.event_type || 'updated'} updated.` });
    } catch (err) {
      setProject(previousProject);
      setForm((prev) => ({
        ...prev,
        eventConfigs: prev.eventConfigs.map((ec, idx) => (idx === index ? { ...ec, is_active: currentValue } : ec)),
      }));
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle child event gateway state.' });
    } finally {
      setToggling(false);
    }
  };

  const updateEventConfig = (index, updater) => {
    setForm((prev) => ({
      ...prev,
      eventConfigs: prev.eventConfigs.map((config, configIndex) => (configIndex === index ? updater(config) : config)),
    }));
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ type: 'success', message: 'Copied to secure buffer.' });
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to write credential to clipboard.' });
    }
  };

  return (
    <ProtectedLayout title={project?.name || 'Project details'} eyebrow="Project workspace">
      <div className="space-y-6 font-sans text-slate-700 dark:text-slate-300">
        
        {/* CRT Scanline Visual Glow Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50" />

        {/* Hero Meta Panel */}
        <section className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#8be9fd]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <button 
                type="button" 
                onClick={() => navigate('/projects')} 
                className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-[#8be9fd] transition duration-150"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                RETURN_TO_WORKSPACE
              </button>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                {project?.name || 'INITIALIZING_NODE'}
                {project?.is_active ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#50fa7b] shadow-[0_0_8px_#50fa7b]" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5555] shadow-[0_0_8px_#ff5555]" />
                )}
              </h1>
              <p className="max-w-2xl text-xs text-zinc-400 font-medium">
                Map ingestion events, configure multi-destination payload dispatch rules, and securely rotate network handshake tokens.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2.5">
              <button 
                type="button" 
                onClick={handleOpenTestModal} 
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-400 transition active:scale-95 shadow-lg"
              >
                <Zap className="h-4 w-4" />
                TEST_WEBHOOK_ENDPOINT
              </button>
              <button 
                type="button" 
                onClick={() => navigate(`/projects/${projectId}/logs`)} 
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#161722] hover:bg-[#1e2030] px-4 py-2.5 text-xs font-bold text-zinc-200 transition active:scale-95 shadow-lg"
              >
                <Database className="h-4 w-4 text-[#8be9fd]" />
                MONITOR_SYS_LOGS
              </button>
              <button 
                type="button" 
                onClick={handleDelete} 
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/10 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2.5 text-xs font-bold text-rose-400 transition active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
                TERMINATE_NODE
              </button>
            </div>
          </div>
        </section>

        {/* Console Stats Tickers */}
        <section className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800/80 bg-[#11121d] p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">CLUSTER_STATE</p>
              <p className="mt-1 text-lg font-bold text-white flex items-center gap-1.5">
                {project?.is_active ? (
                  <>
                    <span className="text-[#50fa7b]">ONLINE</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#50fa7b] animate-ping" />
                  </>
                ) : (
                  <span className="text-[#ff5555]">OFFLINE_PAUSED</span>
                )}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-zinc-800/40 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <Layers size={14} />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-[#11121d] p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">NODE_ADDRESS_HEXID</p>
              <p className="mt-1 text-lg font-bold text-[#8be9fd] tracking-widest">
                {project?.id ? `#${project.id}` : 'N/A'}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-zinc-800/40 border border-zinc-800 flex items-center justify-center text-zinc-500 font-bold text-[10px]">
              UUID
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-[#11121d] p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">ACTIVE_ROUTE_GATEWAYS</p>
              <p className="mt-1 text-lg font-bold text-[#ff79c6]">{form.eventConfigs.length} Map Rules</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-zinc-800/40 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <ExternalLink size={14} />
            </div>
          </div>
        </section>

        {/* Global Action Notifications */}
        {feedback.message && (
          <div className={`rounded-xl px-4 py-3 text-xs font-bold border flex items-center gap-2.5 transition-all animate-pulse ${
            feedback.type === 'error' 
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {feedback.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            SYSTEM: {feedback.message.toUpperCase()}
          </div>
        )}

        {/* Dual Interactive workspace grids */}
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          
          {/* LEFT COLUMN: Project settings Form */}
          <div className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 relative">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#8be9fd]" />
                <div>
                  <h2 className="text-sm font-bold tracking-wider text-white uppercase">PIPELINE_ROUTING_MAPS</h2>
                  <p className="text-[10px] text-zinc-400">Configure event ingest patterns and endpoint dispatch layers.</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={handleToggleActive} 
                disabled={toggling} 
                className={`relative h-6 w-12 rounded-full p-0.5 transition duration-200 border ${
                  project?.is_active 
                    ? 'bg-[#50fa7b]/20 border-[#50fa7b]/40' 
                    : 'bg-zinc-800/80 border-zinc-700'
                }`}
              >
                <span className={`block h-4.5 w-4.5 rounded-full transition duration-200 ${
                  project?.is_active 
                    ? 'translate-x-5.5 bg-[#50fa7b] shadow-[0_0_8px_#50fa7b]' 
                    : 'translate-x-0 bg-zinc-500'
                }`} />
              </button>
            </div>

            {loading ? (
              <div className="mt-5 rounded-xl border border-zinc-800 bg-[#11121d] p-8 text-center text-xs text-zinc-500">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#8be9fd] border-t-transparent mb-2" />
                <p>SYNCING CLUSTER ENVIRONMENT...</p>
              </div>
            ) : !project ? (
              <div className="mt-5 rounded-xl border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
                FAILED TO RESOLVE REMOTE TARGET NODE STATE.
              </div>
            ) : (
              <form className="mt-6 space-y-5" onSubmit={handleSave}>
                
                {/* Node Name input */}
                <div className="space-y-2">
                  <label htmlFor="detail-project-name" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">PROJECT_NODE_LABEL</label>
                  <input 
                    id="detail-project-name" 
                    className="w-full rounded-xl border border-zinc-800 bg-[#11121d] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#8be9fd] transition-colors font-semibold" 
                    value={form.name} 
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} 
                    placeholder="E.g. production-gateway-cluster" 
                  />
                </div>

                {/* Project Description input */}
                <div className="space-y-2">
                  <label htmlFor="detail-project-description" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">PROJECT_DESCRIPTION</label>
                  <textarea 
                    id="detail-project-description" 
                    className="min-h-20 w-full rounded-xl border border-zinc-800 bg-[#11121d] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#8be9fd] transition-colors font-medium resize-y" 
                    value={form.description || ''} 
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} 
                    placeholder="E.g. Routing billing alerts to Slack and Discord" 
                  />
                </div>

                {/* Database cache retention config */}
                <div className="grid gap-3 border-b border-zinc-850 pb-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">RETENTION_BUFFER (DAYS)</label>
                    <input 
                      type="number" 
                      min={0} 
                      className="w-full rounded-xl border border-zinc-800 bg-[#11121d] px-3.5 py-2 text-xs text-white outline-none focus:border-[#ff79c6] transition-colors" 
                      value={form.retentionDays} 
                      onChange={(e) => setForm((prev) => ({ ...prev, retentionDays: Number(e.target.value) }))} 
                    />
                    <span className="text-[10px] text-zinc-500">Packet storage lifetime</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">AUTO-DELETE TIME</label>
                    <input 
                      type="datetime-local" 
                      className="w-full rounded-xl border border-zinc-800 bg-[#11121d] px-3.5 py-2 text-xs text-white outline-none focus:border-[#8be9fd] transition-colors" 
                      value={form.deleteTime || ''} 
                      onChange={(e) => setForm((prev) => ({ ...prev, deleteTime: e.target.value }))} 
                    />
                    <span className="text-[10px] text-zinc-500">Optional cleanup timestamp for old logs</span>
                  </div>
                </div>

                {/* Multi-URL Events Config Grid */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">ROUTING_EVENT_RULES</h3>
                      <p className="text-[10px] text-zinc-500">Attach target URLs to specific hook event targets.</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setForm((prev) => ({ 
                        ...prev, 
                        eventConfigs: [...prev.eventConfigs, { event_type: 'webhook.received', target_urls: ['https://example.com/webhook'] }] 
                      }))} 
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#161722] hover:bg-[#1e2030] px-3 py-2 text-[10px] font-bold text-zinc-300 transition active:scale-95"
                    >
                      <Plus className="h-3 w-3 text-[#50fa7b]" />
                      ATTACH_EVENT
                    </button>
                  </div>

                  {form.eventConfigs.map((config, index) => (
                    <div key={`event-config-${index}`} className="rounded-2xl border border-zinc-200/70 bg-zinc-50/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 relative space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <input 
                          className="w-full rounded-xl border border-zinc-800 bg-[#0a0b10] px-3 py-2 text-xs text-white outline-none font-semibold focus:border-[#bd93f9]" 
                          value={config.event_type} 
                          onChange={(event) => updateEventConfig(index, (item) => ({ ...item, event_type: event.target.value }))} 
                          placeholder="event.routing.signature" 
                        />
                        <div className="flex items-center gap-2">
                          <button 
                            type="button" 
                            disabled={toggling || !config.id} 
                            onClick={() => handleToggleEvent(config.id, config.is_active, index)} 
                            className={`rounded-xl border px-3 py-1.5 text-[10px] font-bold transition duration-150 uppercase tracking-widest ${
                              config.is_active 
                                ? 'bg-[#50fa7b]/15 text-[#50fa7b] border-[#50fa7b]/30' 
                                : 'bg-zinc-800/80 text-zinc-500 border-zinc-700'
                            }`}
                          >
                            {config.is_active ? 'ACTIVE' : 'PAUSED'}
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setForm((prev) => ({ 
                              ...prev, 
                              eventConfigs: prev.eventConfigs.filter((_, itemIndex) => itemIndex !== index) 
                            }))} 
                            className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-[#ff5555] hover:bg-[#ff5555]/5 transition active:scale-95"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                      {/* DYNAMIC MULTIPLE PAYLOAD KEYS & TYPES BUILDER */}
                      <div className="space-y-3 rounded-2xl border border-zinc-800/80 bg-[#080910] p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                              PAYLOAD KEYS & REQUIRED DATA TYPES
                            </label>
                            <p className="text-[10px] font-mono text-zinc-500">Configure key paths and select expected data type rules for payload validation.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              updateEventConfig(index, (item) => {
                                const currentRules = item.payload_rules || [];
                                const nextRules = [...currentRules, { key: '', type: 'string' }];
                                return {
                                  ...item,
                                  payload_rules: nextRules,
                                  payload_keys: nextRules.map((r) => r.key).filter(Boolean),
                                  payload_types: nextRules.map((r) => r.type),
                                };
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono font-bold text-emerald-400 hover:bg-emerald-500/20 transition active:scale-95"
                          >
                            <Plus size={13} />
                            <span>Add Key Rule</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(config.payload_rules || []).length === 0 ? (
                            <p className="text-xs text-zinc-500 font-mono py-2">No payload key rules added yet. Click &quot;Add Key Rule&quot; above.</p>
                          ) : (
                            (config.payload_rules || []).map((rule, ruleIdx) => (
                              <div key={ruleIdx} className="flex flex-col sm:flex-row items-center gap-2">
                                <div className="flex-1 w-full">
                                  <input
                                    className="w-full rounded-xl border border-zinc-800 bg-[#0e1018] px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 font-mono"
                                    value={rule.key}
                                    onChange={(e) => {
                                      const newKey = e.target.value;
                                      updateEventConfig(index, (item) => {
                                        const nextRules = (item.payload_rules || []).map((r, rIdx) =>
                                          rIdx === ruleIdx ? { ...r, key: newKey } : r
                                        );
                                        return {
                                          ...item,
                                          payload_rules: nextRules,
                                          payload_keys: nextRules.map((r) => r.key).filter(Boolean),
                                          payload_types: nextRules.map((r) => r.type),
                                        };
                                      });
                                    }}
                                    placeholder="Key Path (e.g. amount, status, billing.email)"
                                  />
                                </div>
                                <div className="w-full sm:w-44">
                                  <select
                                    className="w-full rounded-xl border border-zinc-800 bg-[#0e1018] px-3 py-2 text-xs text-zinc-200 outline-none focus:border-cyan-400 font-mono"
                                    value={rule.type}
                                    onChange={(e) => {
                                      const newType = e.target.value;
                                      updateEventConfig(index, (item) => {
                                        const nextRules = (item.payload_rules || []).map((r, rIdx) =>
                                          rIdx === ruleIdx ? { ...r, type: newType } : r
                                        );
                                        return {
                                          ...item,
                                          payload_rules: nextRules,
                                          payload_keys: nextRules.map((r) => r.key).filter(Boolean),
                                          payload_types: nextRules.map((r) => r.type),
                                        };
                                      });
                                    }}
                                  >
                                    <option value="string">string (Text)</option>
                                    <option value="number">number (Numeric)</option>
                                    <option value="boolean">boolean (True/False)</option>
                                    <option value="object">object (JSON Object)</option>
                                    <option value="array">array (List)</option>
                                    <option value="any">any (Any Type)</option>
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateEventConfig(index, (item) => {
                                      const nextRules = (item.payload_rules || []).filter((_, rIdx) => rIdx !== ruleIdx);
                                      return {
                                        ...item,
                                        payload_rules: nextRules,
                                        payload_keys: nextRules.map((r) => r.key).filter(Boolean),
                                        payload_types: nextRules.map((r) => r.type),
                                      };
                                    });
                                  }}
                                  className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                                  title="Remove Rule"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">RETENTION DAYS</label>
                          <input
                            type="number"
                            min="0"
                            className="w-full rounded-xl border border-zinc-800 bg-[#0a0b10] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#ff79c6]"
                            value={config.retention_days ?? ''}
                            onChange={(event) => updateEventConfig(index, (item) => ({
                              ...item,
                              retention_days: event.target.value === '' ? null : Number(event.target.value),
                            }))}
                            placeholder="7"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">DELETE TIME</label>
                        <input
                          type="datetime-local"
                          className="w-full rounded-xl border border-zinc-800 bg-[#0a0b10] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#8be9fd]"
                          value={config.delete_time || ''}
                          onChange={(event) => updateEventConfig(index, (item) => ({ ...item, delete_time: event.target.value }))}
                        />
                      </div>

                      {/* Dispatch Endpoint list targets */}
                      <div className="space-y-2.5">
                        {(config.target_urls || []).map((url, urlIndex) => (
                          <div key={`${config.event_type}-${urlIndex}`} className="flex items-center gap-2">
                            <input 
                              className="w-full rounded-xl border border-zinc-800 bg-[#0a0b10] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#8be9fd]" 
                              value={url} 
                              onChange={(event) => updateEventConfig(index, (item) => ({ 
                                ...item, 
                                target_urls: item.target_urls.map((currentUrl, currentIndex) => (currentIndex === urlIndex ? event.target.value : currentUrl)) 
                              }))} 
                              placeholder="https://server.domain/webhooks/listener" 
                            />
                            <button 
                              type="button" 
                              onClick={() => updateEventConfig(index, (item) => ({ 
                                ...item, 
                                target_urls: item.target_urls.filter((_, currentIndex) => currentIndex !== urlIndex) 
                              }))} 
                              className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-[#ff5555] transition active:scale-95"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button 
                        type="button" 
                        onClick={() => updateEventConfig(index, (item) => ({ 
                          ...item, 
                          target_urls: [...(item.target_urls || []), 'https://example.com/webhook'] 
                        }))} 
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#0a0b10] hover:bg-[#11121d] px-2.5 py-1.5 text-[10px] font-bold text-zinc-400 transition hover:text-white"
                      >
                        <Plus className="h-3 w-3 text-[#8be9fd]" />
                        APPEND_TARGET_URL
                      </button>
                    </div>
                  ))}
                </div>

                {/* Save Submit action */}
                <button 
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#50fa7b] hover:bg-[#68ff90] px-4 py-3.5 text-xs font-bold text-[#0a0b10] tracking-wider transition active:scale-98 shadow-lg shadow-[#50fa7b]/10" 
                  disabled={saving} 
                  type="submit"
                >
                  {saving ? 'COMMITTING_TRANSACTION...' : 'SAVE_PIPELINE_MAP'}
                </button>
              </form>
            )}
          </div>

          {/* RIGHT COLUMN: Key Management Credentials Area */}
          <div className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-850 pb-4">
              <div className="rounded-xl bg-amber-500/10 p-2 text-[#ffb86c] border border-amber-500/20 shadow-[0_0_8px_rgba(255,184,108,0.15)]">
                <KeyRound className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-wider text-white uppercase">SECURITY_AND_TOKENS</h3>
                <p className="text-[10px] text-zinc-400">Secure pipeline validation credentials.</p>
              </div>
            </div>

            <button 
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-[#161722] hover:bg-[#1e2030] px-4 py-3.5 text-xs font-bold text-zinc-300 transition active:scale-95" 
              onClick={handleGenerateKeys} 
              disabled={generating} 
              type="button"
            >
              <KeyRound className="h-4 w-4 text-[#ffb86c]" />
              {generating ? 'HANDSHAKE_ROTATION...' : 'REFRESH_NODE_CREDENTIALS'}
            </button>

            {/* Generated Credentials Output Box */}
            {generatedKeys && (
              <div className="rounded-xl border border-[#50fa7b]/20 bg-[#50fa7b]/5 p-5 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#50fa7b]/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#50fa7b] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    TEMPORARY_DECRYPTED_BUFFER
                  </div>
                  {timeLeft > 0 && (
                    <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded flex items-center gap-1.5">
                      <Clock size={10} className="animate-spin" />
                      AUTO-FLUSH IN {timeLeft}S
                    </span>
                  )}
                </div>

                <div className="space-y-3.5">
                  {/* API KEY ROW */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 tracking-wider">NODE_API_KEY</span>
                    <div className="flex items-center justify-between gap-2 bg-[#0a0b10] border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-[#8be9fd]">
                      <span className="truncate flex-1 select-all">{generatedKeys.api_key}</span>
                      <button 
                        type="button" 
                        onClick={() => handleCopy(generatedKeys.api_key)} 
                        className="rounded-md border border-zinc-800 bg-[#161722] hover:bg-zinc-800 p-1.5 text-zinc-300 transition active:scale-90"
                        title="Copy Key"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>

                  {/* SECRET KEY ROW */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 tracking-wider">WEBHOOK_SHARED_SECRET</span>
                    <div className="flex items-center justify-between gap-2 bg-[#0a0b10] border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-[#ff79c6]">
                      <span className="truncate flex-1 select-all">
                        {revealSecret ? generatedKeys.secret_key : '••••••••••••••••••••••••••••••••'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button" 
                          onClick={() => handleCopy(generatedKeys.secret_key)} 
                          className="rounded-md border border-zinc-800 bg-[#161722] hover:bg-zinc-800 p-1.5 text-zinc-300 transition active:scale-90"
                          title="Copy Secret"
                        >
                          <Copy size={12} />
                        </button>
                        <button 
                          type="button" 
                          className="rounded-md border border-zinc-800 bg-[#161722] hover:bg-zinc-800 p-1.5 text-zinc-300 transition active:scale-90" 
                          onClick={() => setRevealSecret((prev) => !prev)}
                        >
                          {revealSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </section>
      </div>

      {/* TEST WEBHOOK DISPATCHER MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0d15] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-5 bg-[#10121d]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Zap size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-mono font-bold text-white uppercase">Test Webhook Gateway Dispatcher</h3>
                  <p className="text-[10px] font-mono text-zinc-400">Sends live signed test payload to POST /v1/gateway</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="rounded-xl border border-zinc-800 p-2 text-xs font-mono text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 p-5 max-h-[75vh] overflow-y-auto">
              
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
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
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
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
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    API Key (X-API-KEY)
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-400"
                    value={testApiKey}
                    onChange={(e) => setTestApiKey(e.target.value)}
                    placeholder="gw_live:..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Webhook Secret (HMAC-SHA256)
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-400"
                    value={testSecretKey}
                    onChange={(e) => setTestSecretKey(e.target.value)}
                    placeholder="Secret Key..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
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
                  className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-mono font-bold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={handleDispatchTestWebhook}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-mono font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition active:scale-95 shadow-md"
                >
                  <Zap size={14} />
                  <span>{testLoading ? 'DISPATCHING...' : 'DISPATCH TEST WEBHOOK'}</span>
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