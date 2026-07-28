import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  Sliders, 
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
  Key
} from 'lucide-react';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';
import { normalizeEventConfigs } from '@/utils/eventConfigUtils';

export default function SettingsTab({ project, form, setForm, onSave, onToggleActive, onDelete, onPurge }) {
  const [showScheduleBox, setShowScheduleBox] = useState(false);
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
      // 1 minute expired! Hide & wipe keys from frontend state
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
      if (data?.api_key) setApiKey(data.api_key);
      if (data?.secret_key) setSecretKey(data.secret_key);
      
      setShowCredentials(true);
      setTimerSeconds(60); // Revealed for strictly 1 minute!
      setFeedback({ type: 'success', message: '✓ Credentials fetched! Visible on frontend for 1 minute.' });
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

  // Regenerate credentials
  const handleRegenerateKeys = async () => {
    if (!project?.id) return;
    if (!window.confirm('Regenerate API Key and HMAC Secret Key for this project? Previous keys will stop working.')) return;

    setLoadingKeys(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}?regenerate=true`);
      if (data?.api_key) setApiKey(data.api_key);
      if (data?.secret_key) setSecretKey(data.secret_key);
      
      setShowCredentials(true);
      setTimerSeconds(60); // Revealed for strictly 1 minute!
      setFeedback({ type: 'success', message: '✓ Project Credentials regenerated! Visible for 1 minute.' });
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

  return (
    <div className="flex flex-col gap-8 font-sans select-none pb-8">
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

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <div>
          <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Project Workspace Settings & Security Credentials
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Configure project parameters, API authorization keys, and retention schedule for <span className="font-semibold text-zinc-800 dark:text-zinc-200">{project?.name}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2.5 text-xs font-semibold text-rose-500 transition active:scale-95 shrink-0"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Project</span>
        </button>
      </div>

      {/* 🔑 DEDICATED PROJECT API KEYS & HMAC SECRET KEY CARD (EXPLICIT 1 MINUTE AUTO-HIDE) */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-emerald-500" />
                Project API Key & HMAC Signing Secret Credentials
              </h3>
              {showCredentials && (
                <span className="text-[11px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded border border-amber-500/30 animate-pulse">
                  Auto-hiding in {timerSeconds}s
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Click 'Refresh / Reveal Credentials' to view keys. Credentials auto-hide after 1 minute for security and can be copied immediately.
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
              <RefreshCw className={`h-3.5 w-3.5 ${loadingKeys ? 'animate-spin text-emerald-500' : ''}`} />
              <span>{showCredentials ? 'Refresh Timer (60s)' : 'Refresh / Reveal Keys (1 Min)'}</span>
            </button>

            <button
              type="button"
              disabled={loadingKeys}
              onClick={handleRegenerateKeys}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
              title="Regenerate Project Keys"
            >
              <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
              <span>Regenerate Keys</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* API Key */}
          <div className="space-y-1.5">
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[11px]">
              Active Event Rules
            </label>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-3.5 py-2 text-xs text-zinc-600 dark:text-zinc-300">
              {eventConfigs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {eventConfigs.map((config) => (
                    <span key={config.id || config.event_type} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      {config.event_type}
                    </span>
                  ))}
                </div>
              ) : (
                <span>No event rules configured for this project yet.</span>
              )}
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[11px]">
              Public API Key (X-API-KEY)
            </label>
            <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
              <input
                type={showCredentials ? 'text' : 'password'}
                readOnly
                value={showCredentials ? apiKey : '••••••••••••••••••••••••••••••••'}
                placeholder="Click Refresh / Reveal Keys to view"
                className="w-full bg-transparent px-3.5 py-2 text-emerald-600 dark:text-emerald-400 outline-none truncate font-mono"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(showCredentials ? apiKey : 'Click Refresh / Reveal Keys to view', 'key')}
                className="p-2.5 text-zinc-400 hover:text-emerald-500 transition border-l border-zinc-200 dark:border-zinc-800 shrink-0 font-sans font-bold flex items-center gap-1"
                title="Copy API Key"
              >
                {copiedKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                <span className="text-[10px]">{copiedKey ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* HMAC Secret Key */}
          <div className="space-y-1.5">
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[11px]">
              HMAC Secret Key (X-GATEWAY-SECRET)
            </label>
            <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
              <input
                type={showCredentials ? 'text' : 'password'}
                readOnly
                value={showCredentials ? secretKey : '••••••••••••••••••••••••••••••••'}
                placeholder="Click Refresh / Reveal Keys to view"
                className="w-full bg-transparent px-3.5 py-2 text-cyan-600 dark:text-cyan-400 outline-none truncate font-mono"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(showCredentials ? secretKey : 'Click Refresh / Reveal Keys to view', 'secret')}
                className="p-2.5 text-zinc-400 hover:text-emerald-500 transition border-l border-zinc-200 dark:border-zinc-800 shrink-0 font-sans font-bold flex items-center gap-1"
                title="Copy Secret Key"
              >
                {copiedSecret ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                <span className="text-[10px]">{copiedSecret ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FORM SECTION 1: GENERAL CONFIGURATION */}
      <form onSubmit={onSave} className="space-y-8">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">General Configuration</h4>
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

          <div className="grid gap-6 sm:grid-cols-2 text-xs">
            <div className="space-y-2">
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Project Name</label>
              <input
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Description</label>
              <input
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-indigo-500"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* SECTION 2: RETENTION SCHEDULE */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-500" />
                Data Retention & Pruning Schedule
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Current execution: <span className="font-mono text-emerald-500 font-bold">{formattedTimeString}</span> ({retentionDaysValue} Days Retention)
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowScheduleBox((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-3.5 py-2 text-xs font-bold text-cyan-600 dark:text-cyan-300 transition"
            >
              <Sliders className="h-4 w-4" />
              <span>{showScheduleBox ? 'Hide Schedule Settings' : 'Configure Schedule'}</span>
              {showScheduleBox ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {showScheduleBox && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 p-6 space-y-6 text-xs">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Retention Policy Mode</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-2.5 text-sm font-mono text-emerald-600 dark:text-emerald-400 outline-none focus:border-indigo-500"
                    value={retentionModeValue}
                    onChange={(e) => setForm((prev) => ({ ...prev, retention_mode: e.target.value, retentionMode: e.target.value }))}
                  >
                    <option value="rolling_days">Rolling Retention (Days)</option>
                    <option value="specific_date">Specific Expiration Date</option>
                    <option value="interval_schedule">Custom Interval Schedule</option>
                  </select>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {retentionModeValue === 'specific_date'
                      ? 'Logs will be deleted once the selected date and time are reached.'
                      : retentionModeValue === 'interval_schedule'
                        ? 'Logs will be cleaned on the configured schedule window.'
                        : 'Logs older than the selected number of days will be removed automatically.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Retention Period (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-2.5 text-sm font-mono text-emerald-600 dark:text-emerald-400 outline-none focus:border-indigo-500"
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
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Specific Expiration Date</label>
                  <input
                    type="date"
                    className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-2.5 text-sm font-mono text-emerald-600 dark:text-emerald-400 outline-none focus:border-indigo-500"
                    value={deleteDateValue}
                    onChange={(e) => setForm((prev) => ({ ...prev, delete_date: e.target.value, deleteDate: e.target.value }))}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Automated Purge Time (HH : MM : SS)</label>
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
                    className="w-16 rounded-xl border border-zinc-200 bg-white p-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
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
                    className="w-16 rounded-xl border border-zinc-200 bg-white p-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
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
                    className="w-16 rounded-xl border border-zinc-200 bg-white p-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                  />
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans ml-2">(UTC)</span>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={onPurge}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-500 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Purge All Project Webhook Data Now</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-xs font-bold text-white shadow-xl transition active:scale-95"
          >
            <Save className="h-4 w-4" />
            <span>Save Configuration Changes</span>
          </button>
        </div>
      </form>
    </div>
  );
}
