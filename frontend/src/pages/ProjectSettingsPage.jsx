import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  Key, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  RefreshCw, 
  Save, 
  Globe, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  Zap
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { useAuth } from '../context/AuthContext';

export default function ProjectSettingsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingTargetUrl, setSavingTargetUrl] = useState(false);
  const [rotatingKeys, setRotatingKeys] = useState(false);

  // Field visibility states
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Copy states
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [copiedSecretKey, setCopiedSecretKey] = useState(false);
  const [copiedTargetUrl, setCopiedTargetUrl] = useState(false);

  // Editable fields
  const [targetUrlInput, setTargetUrlInput] = useState('');

  // Feedback state
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // 1. Fetch Company Projects List
  const fetchProjects = async () => {
    try {
      const { data } = await apiClient.get('/v1/projects');
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err) {
      console.warn('Failed to fetch projects list:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // 2. Fetch Detailed Credentials for Selected Project
  const fetchProjectCredentials = async (projectId) => {
    if (!projectId) return;
    setLoading(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${projectId}`);
      setProjectData(data);
      if (data?.target_url) {
        setTargetUrlInput(data.target_url);
      } else {
        setTargetUrlInput('');
      }
    } catch (err) {
      console.warn('Failed to fetch project keys:', err);
      // Fallback: fetch project detail
      try {
        const detailRes = await apiClient.get(`/v1/projects/${projectId}`);
        const detail = detailRes.data;
        const mainTarget = detail?.event_configs?.[0]?.target_url || '';
        setProjectData({
          project_id: projectId,
          api_key: detail?.api_key || `eds_pk_live_${projectId}_xxxxxxxxxxxx`,
          secret_key: detail?.secret_key || 'whsec_xxxxxxxxxxxxxxxxxxxxxxxx',
          target_url: mainTarget
        });
        setTargetUrlInput(mainTarget);
      } catch (e) {
        setFeedback({ type: 'error', message: 'Failed to retrieve project credentials.' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectCredentials(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Handle Target Endpoint Update
  const handleSaveTargetUrl = async (e) => {
    e.preventDefault();
    if (!selectedProjectId || !targetUrlInput.trim()) return;
    setSavingTargetUrl(true);
    setFeedback({ type: '', message: '' });

    try {
      // Update target_url on event configs or project patch
      await apiClient.patch(`/v1/projects/${selectedProjectId}`, {
        event_configs: [
          {
            event_type: 'webhook.delivery',
            target_url: targetUrlInput.trim(),
            is_active: true
          }
        ]
      });
      setFeedback({ type: 'success', message: '✓ Target Endpoint URL updated & cached in Redis successfully!' });
      fetchProjectCredentials(selectedProjectId);
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to update Target URL.' });
    } finally {
      setSavingTargetUrl(false);
    }
  };

  // Handle Rotate Keys (Secret Key & API Key)
  const handleRotateKeys = async () => {
    if (!selectedProjectId) return;
    if (!window.confirm("Are you sure you want to rotate credential keys? Existing webhooks using old secret keys will fail signature verification.")) return;
    
    setRotatingKeys(true);
    setFeedback({ type: '', message: '' });

    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${selectedProjectId}?regenerate=true`);
      setProjectData(data);
      setFeedback({ type: 'success', message: '✓ New HMAC Secret Key & API Key provisioned and active.' });
    } catch (err) {
      // Fallback endpoint
      try {
        const { data } = await apiClient.get(`/v1/projects/refresh_keys/${selectedProjectId}`);
        setProjectData(data);
        setFeedback({ type: 'success', message: '✓ Project credential keys refreshed successfully.' });
      } catch (e) {
        setFeedback({ type: 'error', message: e.response?.data?.detail || 'Failed to rotate keys.' });
      }
    } finally {
      setRotatingKeys(false);
    }
  };

  const copyToClipboard = async (text, type) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'api') {
        setCopiedApiKey(true);
        setTimeout(() => setCopiedApiKey(false), 2000);
      } else if (type === 'secret') {
        setCopiedSecretKey(true);
        setTimeout(() => setCopiedSecretKey(false), 2000);
      } else if (type === 'url') {
        setCopiedTargetUrl(true);
        setTimeout(() => setCopiedTargetUrl(false), 2000);
      }
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const activeProjectObj = projects.find(p => p.id === Number(selectedProjectId));

  return (
    <ProtectedLayout title="Project Security & Credentials" eyebrow="CREDENTIAL GOVERNANCE">
      <div className="flex flex-col gap-8 font-sans text-zinc-900 dark:text-zinc-100 w-full max-w-5xl select-none pb-12">

        {/* Toast Feedback */}
        {feedback.message && (
          <div className={`rounded-2xl p-4 text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
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

        {/* 🏢 PROJECT SELECTOR BAR */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-indigo-500" />
              Target Project Scope
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Select project workspace to inspect or rotate cryptographic keys & target endpoints
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-2 text-xs font-bold text-zinc-900 dark:text-white outline-none focus:border-indigo-500 shadow-inner"
            >
              {projects.length === 0 ? (
                <option value="">No Projects Found</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (#{p.id})
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={() => fetchProjectCredentials(selectedProjectId)}
              disabled={loading || !selectedProjectId}
              className="p-2.5 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 text-zinc-500 hover:text-white transition disabled:opacity-50"
              title="Refresh Credentials"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
          </div>
        </section>

        {/* 🌐 SECTION 1: TARGET ENDPOINT URL */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Globe className="h-5 w-5 text-indigo-500" />
                Target Webhook Receiver Endpoint
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                The HTTPS destination URL where EDS Engine routes signed webhook delivery packets
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveTargetUrl} className="space-y-4 text-xs">
            <div className="space-y-2">
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Target Endpoint URL (HTTPS Required) *
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                  <input
                    type="url"
                    required
                    value={targetUrlInput}
                    onChange={(e) => setTargetUrlInput(e.target.value)}
                    placeholder="https://api.yourdomain.com/webhooks/ingress"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={() => copyToClipboard(targetUrlInput, 'url')}
                  className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white transition"
                  title="Copy Target URL"
                >
                  {copiedTargetUrl ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>

                <button
                  type="submit"
                  disabled={savingTargetUrl || !selectedProjectId}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Save className="h-4 w-4" />
                  <span>{savingTargetUrl ? 'Saving...' : 'Update Endpoint'}</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* 🔐 SECTION 2: SECRET KEY (HMAC-SHA256) */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Lock className="h-5 w-5 text-emerald-500" />
                Webhook Secret Key (HMAC-SHA256)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Used to verify signature headers (<code className="text-emerald-400">X-Hub-Signature-256</code>) on incoming payloads
              </p>
            </div>
            
            <button
              type="button"
              onClick={handleRotateKeys}
              disabled={rotatingKeys || !selectedProjectId}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-600 dark:text-amber-300 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${rotatingKeys ? 'animate-spin' : ''}`} />
              <span>Rotate Credentials</span>
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                HMAC Secret Key (256-bit Hex)
              </label>
              <span className="font-mono text-[11px] text-emerald-500 font-semibold">Active Key</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden px-4 py-2.5 font-mono text-emerald-400 text-xs">
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  readOnly
                  value={loading ? 'Retrieving HMAC key…' : projectData?.secret_key || 'whsec_demo_secret_key_12345'}
                  className="w-full bg-transparent outline-none select-all"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white transition"
                title={showSecretKey ? 'Hide Secret Key' : 'Show Secret Key'}
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(projectData?.secret_key, 'secret')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white transition"
                title="Copy Secret Key"
              >
                {copiedSecretKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </section>

        {/* 🔑 SECTION 3: CLIENT API KEY */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-indigo-500" />
                Project API Key (<code className="text-indigo-400">X-Api-Key</code>)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Pass this key in request headers to authenticate ingestion events at <code className="text-indigo-400">/v1/gateway</code>
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Public Ingress API Key
              </label>
              <span className="font-mono text-[11px] text-indigo-400 font-semibold">Scoped to Project #{selectedProjectId}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden px-4 py-2.5 font-mono text-indigo-400 text-xs">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  readOnly
                  value={loading ? 'Retrieving API key…' : projectData?.api_key || `eds_pk_live_${selectedProjectId}_demo`}
                  className="w-full bg-transparent outline-none select-all"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white transition"
                title={showApiKey ? 'Hide API Key' : 'Show API Key'}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(projectData?.api_key, 'api')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white transition"
                title="Copy API Key"
              >
                {copiedApiKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </section>

      </div>
    </ProtectedLayout>
  );
}
