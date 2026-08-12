import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  Sliders, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Copy,
  RefreshCw,
  Zap,
  Save,
  Check,
  Key,
  Building2,
  ShieldAlert
} from 'lucide-react';
import apiClient from '@/api/client';
import { normalizeEventConfigs } from '@/utils/eventConfigUtils';

export default function SettingsTab({ project, form, setForm, onSave, onToggleActive, onDelete, onPurge, activeTab = 'settings' }) {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    if (activeTab === 'settings-identity') return 'identity';
    if (activeTab === 'settings-retention') return 'retention';
    if (activeTab === 'settings-danger') return 'danger';
    return 'credentials';
  });

  useEffect(() => {
    if (activeTab === 'settings-identity') setActiveSubTab('identity');
    else if (activeTab === 'settings-retention') setActiveSubTab('retention');
    else if (activeTab === 'settings-danger') setActiveSubTab('danger');
    else if (activeTab === 'settings-credentials' || activeTab === 'settings') setActiveSubTab('credentials');
  }, [activeTab]);

  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');

  // 1 Minute Auto-Hide Credentials State
  const [showCredentials, setShowCredentials] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [loadingKeys, setLoadingKeys] = useState(false);
  
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // 60-Second Auto-Hide Countdown Timer
  useEffect(() => {
    let interval = null;
    if (showCredentials && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && showCredentials) {
      setShowCredentials(false);
      setApiKey('');
      setSecretKey('');
    }
    return () => clearInterval(interval);
  }, [showCredentials, timerSeconds]);

  const setSimCookie = (name, val) => {
    if (!val) return;
    const cleanVal = String(val).trim().replace(/^[{"'\s,:=]+|[}"'\s,:=]+$/g, '').replace(/^["']|["']$/g, '');
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(cleanVal)}; expires=${expires}; path=/; SameSite=Lax`;
    const uiExpiryTime = Date.now() + 60 * 1000;
    const uiExpires = new Date(uiExpiryTime).toUTCString();
    document.cookie = `eds_sim_ui_expiry=${uiExpiryTime}; expires=${uiExpires}; max-age=60; path=/; SameSite=Lax`;
  };

  // Fetch & reveal credentials for 60 seconds on demand
  const handleRefreshCredentials = async () => {
    if (!project?.id) return;
    setLoadingKeys(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
      if (data?.api_key) {
        setApiKey(data.api_key);
        setSimCookie('eds_sim_api_key', data.api_key);
      }
      if (data?.secret_key) {
        setSecretKey(data.secret_key);
        setSimCookie('eds_sim_secret_key', data.secret_key);
      }
      
      setShowCredentials(true);
      setTimerSeconds(60);
      setFeedback({ type: 'success', message: '✓ Credentials stored in HTTP cookies! Unmasked in UI for 60s.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch credentials.' });
    } finally {
      setLoadingKeys(false);
    }
  };

  const copyBothCredentials = async () => {
    if (!apiKey && !secretKey) return;
    const text = `API Key: ${apiKey}\nSecret Key: ${secretKey}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(true);
      setCopiedSecret(true);
      setTimeout(() => {
        setCopiedKey(false);
        setCopiedSecret(false);
      }, 2000);
    } catch (err) {
      console.warn('Clipboard copy failed', err);
    }
  };

  const handleRegenerateKeys = async () => {
    if (!project?.id) return;
    if (!window.confirm('Regenerate API Key and HMAC Secret Key for this project? Previous keys will stop working.')) return;

    setLoadingKeys(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}?regenerate=true`);
      if (data?.api_key) {
        setApiKey(data.api_key);
        setSimCookie('eds_sim_api_key', data.api_key);
      }
      if (data?.secret_key) {
        setSecretKey(data.secret_key);
        setSimCookie('eds_sim_secret_key', data.secret_key);
      }
      
      setShowCredentials(true);
      setTimerSeconds(60);
      setFeedback({ type: 'success', message: '✓ Project credentials regenerated & stored in HTTP cookies! Visible for 60s.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to regenerate credentials.' });
    } finally {
      setLoadingKeys(false);
    }
  };


  const copyToClipboard = async (text, type) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      }
    } catch (err) {
      console.warn('Clipboard copy failed', err);
    }
  };

  const retentionDaysValue = form.retentionDays ?? form.retention_days ?? 30;

  return (
    <div className="flex flex-col gap-6 font-sans select-none pb-12 w-full max-w-5xl mx-auto">
      {/* Toast Feedback */}
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

      {/* 🧭 TOP HORIZONTAL PILL NAV (REPLACES 2ND SIDEBAR) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-md">
        <button
          type="button"
          onClick={() => setActiveSubTab('credentials')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'credentials'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Key className="h-4 w-4 text-amber-400" />
          <span>Credentials & Keys</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('identity')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'identity'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Building2 className="h-4 w-4 text-cyan-400" />
          <span>Project Identity</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('retention')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'retention'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Clock className="h-4 w-4 text-indigo-400" />
          <span>Retention & Schedule</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('danger')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'danger'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          <span>Danger Zone</span>
        </button>
      </div>

      {/* 📄 MAIN SINGLE CONTENT PANEL */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md min-h-[480px]">
        
        {/* 🔑 SUB-TAB 1: CREDENTIALS & KEYS */}
        {activeSubTab === 'credentials' && (
          <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Key className="h-6 w-6 text-emerald-500" />
                  API Key & Secret Signing Credentials
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Click 'Reveal Keys' to view API credentials. Keys auto-hide after 1 minute for security.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyBothCredentials}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Both</span>
                </button>

                <button
                  type="button"
                  disabled={loadingKeys}
                  onClick={handleRefreshCredentials}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 transition active:scale-95 shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingKeys ? 'animate-spin' : ''}`} />
                  <span>{showCredentials ? `Timer (${timerSeconds}s)` : 'Reveal Keys (1 Min)'}</span>
                </button>

                <button
                  type="button"
                  disabled={loadingKeys}
                  onClick={handleRegenerateKeys}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                >
                  <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Regenerate</span>
                </button>
              </div>
            </div>

            <div className="space-y-6 text-xs max-w-2xl">
              <div className="space-y-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                  PUBLIC API KEY (X-API-KEY)
                </label>
                <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 p-3 shadow-inner">
                  <input
                    type={showCredentials ? 'text' : 'password'}
                    readOnly
                    value={showCredentials ? apiKey : '••••••••••••••••••••••••••••••••'}
                    className="w-full bg-transparent px-2 text-emerald-600 dark:text-emerald-400 outline-none truncate font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(showCredentials ? apiKey : '', 'key')}
                    className="text-zinc-400 hover:text-emerald-500 px-2 font-bold flex items-center gap-1"
                  >
                    {copiedKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                  HMAC SECRET KEY (X-GATEWAY-SECRET)
                </label>
                <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 p-3 shadow-inner">
                  <input
                    type={showCredentials ? 'text' : 'password'}
                    readOnly
                    value={showCredentials ? secretKey : '••••••••••••••••••••••••••••••••'}
                    className="w-full bg-transparent px-2 text-cyan-600 dark:text-cyan-400 outline-none truncate font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(showCredentials ? secretKey : '', 'secret')}
                    className="text-zinc-400 hover:text-cyan-500 px-2 font-bold flex items-center gap-1"
                  >
                    {copiedSecret ? <Check className="h-4 w-4 text-cyan-500" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 🏢 SUB-TAB 2: PROJECT IDENTITY */}
        {activeSubTab === 'identity' && (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-6 w-6 text-indigo-500" />
                Project Workspace Identity & Configuration
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Manage node label name, description notes, and ingress activation mode
              </p>
            </div>

            <form onSubmit={onSave} className="space-y-6 text-xs max-w-2xl">
              <div className="space-y-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                  PROJECT WORKSPACE NAME *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-semibold shadow-inner"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                  DESCRIPTION NOTES
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white shadow-inner resize-y"
                />
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <div>
                  <div className="font-bold text-zinc-900 dark:text-white">Ingress Ingestion Route</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Toggle to pause or resume incoming webhooks</div>
                </div>
                <button
                  type="button"
                  onClick={onToggleActive}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    form.is_active
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {form.is_active ? 'Status: Active' : 'Status: Paused'}
                </button>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Project Identity</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ⏱️ SUB-TAB 3: RETENTION & SCHEDULE */}
        {activeSubTab === 'retention' && (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="h-6 w-6 text-indigo-400" />
                Log Retention Policy & Pruning Schedule
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Configure rolling log window retention and scheduled automatic log purges
              </p>
            </div>

            <form onSubmit={onSave} className="space-y-6 text-xs max-w-2xl">
              <div className="space-y-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                  RETENTION WINDOW (DAYS)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={retentionDaysValue}
                  onChange={(e) => setForm(prev => ({ ...prev, retention_days: Number(e.target.value) }))}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono shadow-inner"
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Retention Schedule</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 🚨 SUB-TAB 4: DANGER ZONE */}
        {activeSubTab === 'danger' && (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold text-rose-500 flex items-center gap-2">
                <ShieldAlert className="h-6 w-6 text-rose-500" />
                Danger Zone & Permanent Actions
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Purge historical log entries or permanently delete this project node
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-amber-400 text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Purge Log Data
                  </h4>
                  <p className="text-zinc-400 text-[11px] mt-1 leading-relaxed">
                    Clear all historical webhook delivery logs and dead-letter queue records for this project.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onPurge}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-4 py-2.5 font-bold text-amber-300 transition active:scale-95 mt-2"
                >
                  <span>Purge Logs & DLQ</span>
                </button>
              </div>

              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-rose-400 text-sm flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete Project Node
                  </h4>
                  <p className="text-zinc-400 text-[11px] mt-1 leading-relaxed">
                    Permanently destroy this project workspace and all event routing rules.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDelete}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 font-bold text-white shadow-lg transition active:scale-95 mt-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Project Workspace</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
