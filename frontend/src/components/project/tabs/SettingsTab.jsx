import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  SlidersHorizontal, 
  ChevronUp, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Copy,
  RefreshCw,
  Zap,
  Save,
  Check,
  Eye,
  EyeOff,
  Key,
  FolderKanban,
  AlertCircle
} from 'lucide-react';
import apiClient from '@/api/client';
import { normalizeEventConfigs } from '@/utils/eventConfigUtils';

export default function SettingsTab({ project, form, setForm, onSave, onToggleActive, onDelete, onPurge }) {
  // Active Sub-Navigation Tab: 'general' | 'keys' | 'retention' | 'danger'
  const [activeTab, setActiveTab] = useState('general');

  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  
  const parseDeleteTime = (value = '') => {
    const [hours = '02', minutes = '00', seconds = '00'] = String(value || '02:00').split(':');
    return {
      hour: String(hours).padStart(2, '0'),
      minute: String(minutes).padStart(2, '0'),
      second: String(seconds).padStart(2, '0'),
    };
  };
  const [timeParts, setTimeParts] = useState(() => parseDeleteTime(form.delete_time || form.deleteTime || '02:00'));
  
  // 1 Minute Auto-Hide Credentials State
  const [showCredentials, setShowCredentials] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [loadingKeys, setLoadingKeys] = useState(false);
  
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  useEffect(() => {
    setTimeParts(parseDeleteTime(form.delete_time || form.deleteTime || '02:00'));
  }, [form.delete_time, form.deleteTime]);

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

  // Fetch & reveal credentials for 1 minute on demand
  const handleRefreshCredentials = async () => {
    if (!project?.id) return;
    setLoadingKeys(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
      if (data?.api_key) {
        const cleanK = data.api_key.trim().replace(/^["']|["']$/g, '');
        setApiKey(cleanK);
        localStorage.setItem(`eds_project_${project.id}_api_key`, cleanK);
      }
      if (data?.secret_key) {
        const cleanS = data.secret_key.trim().replace(/^["']|["']$/g, '');
        setSecretKey(cleanS);
        localStorage.setItem(`eds_project_${project.id}_secret_key`, cleanS);
      }
      
      setShowCredentials(true);
      setTimerSeconds(60);
      setFeedback({ type: 'success', message: '✓ Credentials fetched & saved! Auto-synced to Webhook Simulator.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch credentials.' });
    } finally {
      setLoadingKeys(false);
    }
  };

  const copyBothCredentials = async () => {
    if (!apiKey && !secretKey) return;
    const text = `API_KEY: ${apiKey}\nSECRET_KEY: ${secretKey}`;
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
        const cleanK = data.api_key.trim().replace(/^["']|["']$/g, '');
        setApiKey(cleanK);
        localStorage.setItem(`eds_project_${project.id}_api_key`, cleanK);
      }
      if (data?.secret_key) {
        const cleanS = data.secret_key.trim().replace(/^["']|["']$/g, '');
        setSecretKey(cleanS);
        localStorage.setItem(`eds_project_${project.id}_secret_key`, cleanS);
      }
      
      setShowCredentials(true);
      setTimerSeconds(60);
      setFeedback({ type: 'success', message: '✓ Project Credentials regenerated & saved! Auto-synced to Webhook Simulator.' });
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

  const formattedTimeString = `${String(timeParts.hour || '02').padStart(2, '0')}:${String(timeParts.minute || '00').padStart(2, '0')}:${String(timeParts.second || '00').padStart(2, '0')}`;
  const retentionModeValue = form.retention_mode || form.retentionMode || 'rolling_days';
  const retentionDaysValue = form.retentionDays ?? form.retention_days ?? 30;
  const deleteDateValue = form.delete_date || form.deleteDate || '';
  const eventConfigs = normalizeEventConfigs(project?.event_configs || []);

  const navItems = [
    { id: 'general', label: 'General Configuration', icon: SlidersHorizontal },
    { id: 'keys', label: 'API Keys & HMAC Secrets', icon: Key },
    { id: 'retention', label: 'Data Retention & Pruning', icon: Clock },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, danger: true }
  ];

  return (
    <div className="space-y-6 font-sans select-none pb-12">
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

      {/* Main Two-Column Side-Nav Layout (Exact Match to Company SettingsPage) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Sub-Navigation Sidebar */}
        <div className="lg:col-span-3">
          <div className="sticky top-24 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-[#0d1017]">
            <span className="block px-3 pb-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Project Settings Menu
            </span>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                      isActive 
                        ? item.danger
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                          : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                        : item.danger
                          ? 'text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/20'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 px-3">
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono block">Node Status</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`h-2 w-2 rounded-full ${form.is_active !== false ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {form.is_active !== false ? 'Active & Receiving' : 'Paused Node'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Active Panel Content */}
        <div className="lg:col-span-9">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xl dark:border-zinc-800 dark:bg-[#0d1017]">
            
            {/* TAB 1: GENERAL CONFIGURATION */}
            {activeTab === 'general' && (
              <form onSubmit={onSave} className="space-y-6">
                <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2.5">
                      <SlidersHorizontal className="h-5 w-5 text-indigo-500" />
                      General Node Configuration
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Configure baseline workspace name, description, and status for project <span className="font-semibold text-zinc-800 dark:text-zinc-200">{project?.name}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-1.5 text-xs font-semibold">
                    <span className={form.is_active !== false ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-zinc-400'}>
                      {form.is_active !== false ? 'Active Node' : 'Paused'}
                    </span>
                    <button
                      type="button"
                      onClick={onToggleActive}
                      className={`relative h-5 w-10 rounded-full p-0.5 transition ${form.is_active !== false ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    >
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${form.is_active !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">PROJECT NAME *</label>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 font-medium"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">PROJECT DESCRIPTION</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-indigo-500 font-medium"
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter operational workspace notes or target endpoint description..."
                    />
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">CONFIGURED EVENT TYPES ({eventConfigs.length})</label>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 p-4 text-xs text-zinc-600 dark:text-zinc-300">
                      {eventConfigs.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {eventConfigs.map((config) => (
                            <span key={config.id || config.event_type} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                              {config.event_type}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span>No event rules configured for this project yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-xs font-bold text-white shadow-xl transition active:scale-95"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Node Details</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: API KEYS & HMAC SECRETS */}
            {activeTab === 'keys' && (
              <div className="space-y-6">
                <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2.5">
                        <Key className="h-5 w-5 text-emerald-500" />
                        Project Credentials & Signing Secrets
                      </h3>
                      {showCredentials && (
                        <span className="text-[11px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded border border-amber-500/30 animate-pulse">
                          Auto-hiding in {timerSeconds}s
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Authentication tokens used by external webhooks to submit events to `/v1/gateway`
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={copyBothCredentials}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition active:scale-95"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Both</span>
                    </button>

                    <button
                      type="button"
                      disabled={loadingKeys}
                      onClick={handleRefreshCredentials}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 transition active:scale-95"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingKeys ? 'animate-spin text-emerald-500' : ''}`} />
                      <span>{showCredentials ? 'Refresh (60s)' : 'Reveal Keys (1 Min)'}</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 text-xs font-mono">
                  {/* Public API Key */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[11px]">
                      Public API Key (X-API-KEY)
                    </label>
                    <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
                      <input
                        type={showCredentials ? 'text' : 'password'}
                        readOnly
                        value={showCredentials ? apiKey : '••••••••••••••••••••••••••••••••'}
                        placeholder="Click Reveal Keys (1 Min) to view secret"
                        className="w-full bg-transparent px-4 py-3 text-emerald-600 dark:text-emerald-400 outline-none truncate font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(showCredentials ? apiKey : 'Click Reveal Keys to view', 'key')}
                        className="p-3 text-zinc-400 hover:text-emerald-500 transition border-l border-zinc-200 dark:border-zinc-800 shrink-0 font-sans font-bold flex items-center gap-1.5"
                      >
                        {copiedKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        <span className="text-[11px]">{copiedKey ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* HMAC Secret Key */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[11px]">
                      HMAC Signing Secret Key (X-HUB-SIGNATURE)
                    </label>
                    <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
                      <input
                        type={showCredentials ? 'text' : 'password'}
                        readOnly
                        value={showCredentials ? secretKey : '••••••••••••••••••••••••••••••••'}
                        placeholder="Click Reveal Keys (1 Min) to view secret"
                        className="w-full bg-transparent px-4 py-3 text-cyan-600 dark:text-cyan-400 outline-none truncate font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(showCredentials ? secretKey : 'Click Reveal Keys to view', 'secret')}
                        className="p-3 text-zinc-400 hover:text-emerald-500 transition border-l border-zinc-200 dark:border-zinc-800 shrink-0 font-sans font-bold flex items-center gap-1.5"
                      >
                        {copiedSecret ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        <span className="text-[11px]">{copiedSecret ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                  <p className="text-[11px] text-zinc-400 font-sans">
                    Regenerating credentials will instantly invalidate existing webhooks using previous keys.
                  </p>
                  <button
                    type="button"
                    disabled={loadingKeys}
                    onClick={handleRegenerateKeys}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-500 transition active:scale-95 shrink-0"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>Rotate / Regenerate Keys</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: DATA RETENTION & PRUNING */}
            {activeTab === 'retention' && (
              <form onSubmit={onSave} className="space-y-6">
                <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2.5">
                    <Clock className="h-5 w-5 text-cyan-500" />
                    Data Retention & Pruning Schedule
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Configure automated log deletion window and periodic cleanup execution
                  </p>
                </div>

                <div className="space-y-6 text-xs">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">RETENTION POLICY MODE</label>
                      <select
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400 outline-none focus:border-indigo-500"
                        value={retentionModeValue}
                        onChange={(e) => setForm((prev) => ({ ...prev, retention_mode: e.target.value, retentionMode: e.target.value }))}
                      >
                        <option value="rolling_days">Rolling Retention (Days)</option>
                        <option value="specific_date">Specific Expiration Date</option>
                        <option value="interval_schedule">Custom Interval Schedule</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">RETENTION PERIOD (DAYS)</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400 outline-none focus:border-indigo-500"
                        value={retentionDaysValue}
                        onChange={(e) => {
                          const value = Number(e.target.value) || 1;
                          setForm((prev) => ({ ...prev, retentionDays: value, retention_days: value }));
                        }}
                      />
                    </div>
                  </div>

                  {retentionModeValue === 'specific_date' && (
                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">SPECIFIC EXPIRATION DATE</label>
                      <input
                        type="date"
                        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400 outline-none focus:border-indigo-500"
                        value={deleteDateValue}
                        onChange={(e) => setForm((prev) => ({ ...prev, delete_date: e.target.value, deleteDate: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">AUTOMATED PURGE TIME (HH : MM : SS UTC)</label>
                    <div className="flex items-center gap-2 font-mono">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={timeParts.hour}
                        onChange={(e) => {
                          const next = { ...timeParts, hour: String(e.target.value).padStart(2, '0') };
                          setTimeParts(next);
                          setForm((prev) => ({ ...prev, delete_time: `${next.hour}:${next.minute}:${next.second}`, deleteTime: `${next.hour}:${next.minute}:${next.second}` }));
                        }}
                        className="w-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={timeParts.minute}
                        onChange={(e) => {
                          const next = { ...timeParts, minute: String(e.target.value).padStart(2, '0') };
                          setTimeParts(next);
                          setForm((prev) => ({ ...prev, delete_time: `${next.hour}:${next.minute}:${next.second}`, deleteTime: `${next.hour}:${next.minute}:${next.second}` }));
                        }}
                        className="w-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={timeParts.second}
                        onChange={(e) => {
                          const next = { ...timeParts, second: String(e.target.value).padStart(2, '0') };
                          setTimeParts(next);
                          setForm((prev) => ({ ...prev, delete_time: `${next.hour}:${next.minute}:${next.second}`, deleteTime: `${next.hour}:${next.minute}:${next.second}` }));
                        }}
                        className="w-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans ml-2">(UTC Execution)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={onPurge}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2.5 text-xs font-bold text-rose-500 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Purge Webhook Logs Now</span>
                  </button>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-xs font-bold text-white shadow-xl transition active:scale-95"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Schedule</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 4: DANGER ZONE */}
            {activeTab === 'danger' && (
              <div className="space-y-6">
                <div className="border-b border-rose-500/20 pb-4">
                  <h3 className="text-lg font-black text-rose-500 flex items-center gap-2.5">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    Danger Zone & Project Deletion
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Irreversible workspace destruction actions. Proceed with extreme caution.
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Delete Project Node "{project?.name}"</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Deleting this project will permanently remove all event configurations, API keys, webhook history logs, and dead letter queue items.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={onDelete}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-2.5 text-xs font-bold text-white shadow-xl transition active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Permanently Delete Project</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
