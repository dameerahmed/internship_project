import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  KeyRound,
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
  SlidersHorizontal,
  Layers,
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

  // Copy feedback states
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [copiedSecretKey, setCopiedSecretKey] = useState(false);
  const [copiedTargetUrl, setCopiedTargetUrl] = useState(false);

  // Form input states
  const [targetUrlInput, setTargetUrlInput] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('credentials'); // 'credentials' | 'endpoint' | 'retention'

  // Feedback banner state
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
      setTargetUrlInput(data?.target_url || '');
    } catch (err) {
      console.warn('Failed to fetch project keys:', err);
      try {
        const detailRes = await apiClient.get(`/v1/projects/${projectId}`);
        const detail = detailRes.data;
        const mainTarget = detail?.event_configs?.[0]?.target_url || '';
        setProjectData({
          project_id: projectId,
          api_key: detail?.api_key || `eds_pk_live_${projectId}_xxxxxxxxxxxx`,
          secret_key: detail?.secret_key || 'whsec_xxxxxxxxxxxxxxxxxxxxxxxx',
          target_url: mainTarget,
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
      await apiClient.patch(`/v1/projects/${selectedProjectId}`, {
        event_configs: [
          {
            event_type: 'webhook.delivery',
            target_url: targetUrlInput.trim(),
            is_active: true,
          },
        ],
      });
      setFeedback({ type: 'success', message: '✓ Project default endpoint URL updated successfully!' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update target endpoint URL.' });
    } finally {
      setSavingTargetUrl(false);
    }
  };

  // Handle Key Rotation
  const handleRotateKeys = async () => {
    if (!selectedProjectId) return;
    if (!window.confirm('Are you sure you want to rotate API & HMAC Secret keys? Current keys will be invalidated immediately.')) {
      return;
    }
    setRotatingKeys(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.post(`/v1/projects/refresh_keys/${selectedProjectId}`);
      setProjectData(data);
      setFeedback({ type: 'success', message: '✓ API credentials rotated successfully. Make sure to update your clients!' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Key rotation failed.' });
    } finally {
      setRotatingKeys(false);
    }
  };

  const copyText = (text, setCopiedState) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const selectedProjectObj = projects.find((p) => p.id === Number(selectedProjectId));

  return (
    <ProtectedLayout title="Project Security &amp; Credentials" eyebrow="Governance">
      <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto font-display animate-fade-in">

        {/* Header banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4"
             style={{ borderBottom: '1px solid var(--eds-border)' }}>
          <div>
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--eds-text)' }}>
              Project Settings &amp; API Keys
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--eds-muted)' }}>
              Manage HMAC secrets, endpoint routing rules, and security tokens per workspace node
            </p>
          </div>

          {/* Project selector dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-mono font-bold shrink-0" style={{ color: 'var(--eds-muted)' }}>
              Workspace:
            </label>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              className="eds-input font-bold py-1.5 px-3 min-w-[200px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Node #{p.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feedback alert */}
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

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Sub-Navigation Sidebar */}
          <div className="lg:col-span-3 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest font-mono px-3 py-1 mb-2"
                 style={{ color: 'var(--eds-faint)' }}>
              Configuration Sections
            </div>
            {[
              { id: 'credentials', label: 'API Keys & HMAC', icon: KeyRound, color: 'var(--eds-accent-2)' },
              { id: 'endpoint',    label: 'Default Endpoint', icon: Globe,    color: 'var(--eds-info)' },
              { id: 'retention',   label: 'Purge & Retention', icon: Layers,   color: 'var(--eds-warning)' },
            ].map((st) => {
              const Icon = st.icon;
              const isActive = activeSubTab === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setActiveSubTab(st.id)}
                  className="w-full flex items-center gap-3 rounded-eds px-3 py-2.5 text-xs font-semibold transition-all duration-150 text-left"
                  style={
                    isActive
                      ? {
                          background: 'var(--eds-accent-dim)',
                          borderLeft: '2px solid var(--eds-accent)',
                          color: 'var(--eds-accent-2)',
                        }
                      : {
                          color: 'var(--eds-muted)',
                          borderLeft: '2px solid transparent',
                        }
                  }
                >
                  <Icon size={15} style={{ color: isActive ? 'var(--eds-accent-2)' : st.color }} />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div
            className="lg:col-span-9 rounded-eds-md p-6 space-y-6 shadow-eds-md"
            style={{
              background: 'var(--eds-panel)',
              border: '1px solid var(--eds-border)',
            }}
          >

            {/* TAB 1: API Keys & HMAC Secret */}
            {activeSubTab === 'credentials' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--eds-text)' }}>
                    <KeyRound size={16} style={{ color: 'var(--eds-accent-2)' }} />
                    API Credentials &amp; HMAC Signature Secret
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--eds-muted)' }}>
                    These keys authenticate your upstream webhook senders and sign outgoing delivery payloads.
                  </p>
                </div>

                {loading ? (
                  <div className="flex h-32 items-center justify-center text-xs font-semibold gap-2" style={{ color: 'var(--eds-muted)' }}>
                    <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--eds-accent-2)' }} />
                    <span>Loading project security keys…</span>
                  </div>
                ) : (
                  <div className="space-y-5">

                    {/* API Key */}
                    <div className="space-y-1.5">
                      <label className="eds-label">API Access Key (`X-API-KEY`)</label>
                      <div className="relative flex items-center">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          readOnly
                          value={projectData?.api_key || ''}
                          className="eds-input font-mono pr-20 text-eds-accent-2"
                        />
                        <div className="absolute right-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setShowApiKey((v) => !v)}
                            className="p-1 rounded transition-colors"
                            style={{ color: 'var(--eds-muted)' }}
                            title={showApiKey ? 'Hide key' : 'Show key'}
                          >
                            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyText(projectData?.api_key, setCopiedApiKey)}
                            className="p-1 rounded transition-colors"
                            style={{ color: copiedApiKey ? 'var(--eds-success)' : 'var(--eds-muted)' }}
                            title="Copy to clipboard"
                          >
                            {copiedApiKey ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* HMAC Secret */}
                    <div className="space-y-1.5">
                      <label className="eds-label">HMAC SHA-256 Secret (`X-HUB-SIGNATURE`)</label>
                      <div className="relative flex items-center">
                        <input
                          type={showSecretKey ? 'text' : 'password'}
                          readOnly
                          value={projectData?.secret_key || ''}
                          className="eds-input font-mono pr-20 text-eds-success"
                        />
                        <div className="absolute right-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setShowSecretKey((v) => !v)}
                            className="p-1 rounded transition-colors"
                            style={{ color: 'var(--eds-muted)' }}
                            title={showSecretKey ? 'Hide secret' : 'Show secret'}
                          >
                            {showSecretKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyText(projectData?.secret_key, setCopiedSecretKey)}
                            className="p-1 rounded transition-colors"
                            style={{ color: copiedSecretKey ? 'var(--eds-success)' : 'var(--eds-muted)' }}
                            title="Copy to clipboard"
                          >
                            {copiedSecretKey ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Rotate button */}
                    <div className="pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--eds-border)' }}>
                      <span className="text-[11px]" style={{ color: 'var(--eds-muted)' }}>
                        Rotating keys immediately revokes existing client access.
                      </span>
                      <button
                        type="button"
                        onClick={handleRotateKeys}
                        disabled={rotatingKeys}
                        className="eds-btn-ghost text-xs"
                      >
                        <RefreshCw size={13} className={rotatingKeys ? 'animate-spin' : ''} />
                        <span>{rotatingKeys ? 'Rotating…' : 'Rotate API Keys'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Default Target Endpoint */}
            {activeSubTab === 'endpoint' && (
              <form onSubmit={handleSaveTargetUrl} className="space-y-5">
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--eds-text)' }}>
                    <Globe size={16} style={{ color: 'var(--eds-info)' }} />
                    Default Webhook Delivery Target Endpoint
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--eds-muted)' }}>
                    Incoming webhooks sent to this project node will be delivered to this URL endpoint.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="eds-label">Destination URL Endpoint *</label>
                  <div className="relative flex items-center">
                    <input
                      type="url"
                      required
                      placeholder="https://api.yourcompany.com/v1/webhook-receiver"
                      value={targetUrlInput}
                      onChange={(e) => setTargetUrlInput(e.target.value)}
                      className="eds-input font-mono text-eds-success pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(targetUrlInput, setCopiedTargetUrl)}
                      className="absolute right-3 transition-colors"
                      style={{ color: copiedTargetUrl ? 'var(--eds-success)' : 'var(--eds-muted)' }}
                      title="Copy URL"
                    >
                      {copiedTargetUrl ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingTargetUrl}
                    className="eds-btn-primary"
                  >
                    <Save size={14} />
                    <span>{savingTargetUrl ? 'Saving URL…' : 'Save Default Target Endpoint'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: Purge & Retention Policy */}
            {activeSubTab === 'retention' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--eds-text)' }}>
                    <Layers size={16} style={{ color: 'var(--eds-warning)' }} />
                    Data Retention &amp; Automated Purge Rules
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--eds-muted)' }}>
                    Configure automatic data purging schedule to meet compliance requirements.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="eds-label">Retention Mode</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedProjectObj?.retention_mode || 'rolling_days'}
                      className="eds-input capitalize font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="eds-label">Rolling Retention Period</label>
                    <input
                      type="text"
                      readOnly
                      value={`${selectedProjectObj?.retention_days ?? 30} Days`}
                      className="eds-input font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
