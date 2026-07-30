import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  KeyRound, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Code2, 
  Sliders,
  RefreshCw,
  Globe,
  ClipboardPaste,
  FileJson
} from 'lucide-react';
import apiClient from '@/api/client';
import { normalizeEventConfigs } from '@/utils/eventConfigUtils';

export default function SimulatorTab({ project }) {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [selectedEventName, setSelectedEventName] = useState('');
  const [eventType, setEventType] = useState('');
  const [payloadStr, setPayloadStr] = useState(JSON.stringify({}, null, 2));
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetchingKeys, setFetchingKeys] = useState(false);

  const eventConfigs = normalizeEventConfigs(project?.event_configs || []);

  // Build a payload template from the configured schema without introducing fake example data.
  const generateSamplePayloadForEvent = (eventConfig) => {
    const keys = eventConfig?.payload_keys || eventConfig?.metadata_json?.payload_keys || [];
    const types = eventConfig?.payload_types || eventConfig?.metadata_json?.payload_types || [];

    const sampleObj = {};

    if (keys.length === 0) {
      return JSON.stringify({ event: eventConfig?.event_type || '', data: {} }, null, 2);
    }

    keys.forEach((key, idx) => {
      const kType = (types[idx] || 'string').toLowerCase();
      if (kType === 'number') {
        sampleObj[key] = 0;
      } else if (kType === 'boolean') {
        sampleObj[key] = false;
      } else if (kType === 'object') {
        sampleObj[key] = {};
      } else if (kType === 'array') {
        sampleObj[key] = [];
      } else {
        sampleObj[key] = '';
      }
    });

    return JSON.stringify(sampleObj, null, 2);
  };



  const cleanCredential = (val) => {
    if (!val || typeof val !== 'string') return '';
    return val
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/[\r\n\t]/g, '')
      .replace(/\s+/g, '');
  };

  // 🔄 Auto-load or fetch credentials on mount / project change
  useEffect(() => {
    if (!project?.id) return;
    const storedKey = localStorage.getItem(`eds_project_${project.id}_api_key`);
    const storedSecret = localStorage.getItem(`eds_project_${project.id}_secret_key`);
    
    if (storedKey) setApiKey(cleanCredential(storedKey));
    if (storedSecret) setSecretKey(cleanCredential(storedSecret));

    // Auto-fetch if not stored yet
    if (!storedKey || !storedSecret) {
      handleFetchProjectKeys();
    }
  }, [project?.id]);

  const handleFetchProjectKeys = async () => {
    if (!project?.id) return;
    setFetchingKeys(true);
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
      if (data?.api_key) {
        const cleanK = cleanCredential(data.api_key);
        setApiKey(cleanK);
        localStorage.setItem(`eds_project_${project.id}_api_key`, cleanK);
      }
      if (data?.secret_key) {
        const cleanS = cleanCredential(data.secret_key);
        setSecretKey(cleanS);
        localStorage.setItem(`eds_project_${project.id}_secret_key`, cleanS);
      }
    } catch (err) {
      console.warn('Failed to fetch live project credentials:', err);
    } finally {
      setFetchingKeys(false);
    }
  };

  const handleApiKeyChange = (val) => {
    const cleaned = cleanCredential(val);
    setApiKey(cleaned);
    if (project?.id && cleaned) {
      localStorage.setItem(`eds_project_${project.id}_api_key`, cleaned);
    }
  };

  const handleSecretKeyChange = (val) => {
    const cleaned = cleanCredential(val);
    setSecretKey(cleaned);
    if (project?.id && cleaned) {
      localStorage.setItem(`eds_project_${project.id}_secret_key`, cleaned);
    }
  };

  // Set default selected event if configs available
  useEffect(() => {
    if (eventConfigs.length > 0) {
      const hasCurrentSelection = eventConfigs.some((config) => config.event_type === selectedEventName);
      if (!hasCurrentSelection) {
        const first = eventConfigs[0];
        setSelectedEventName(first.event_type);
        setEventType(first.event_type);
        setPayloadStr(generateSamplePayloadForEvent(first));
      }
    }
  }, [eventConfigs, selectedEventName]);

  useEffect(() => {
    if (!selectedEventName && eventConfigs.length > 0) {
      const first = eventConfigs[0];
      setSelectedEventName(first.event_type);
      setEventType(first.event_type);
      setPayloadStr(generateSamplePayloadForEvent(first));
    }
  }, [eventConfigs, selectedEventName]);

  // 🎯 Event Selection Handler: Auto populates default payload keys for selected event!
  const handleEventSelect = (eName) => {
    setSelectedEventName(eName);
    if (!eName) return;
    setEventType(eName);

    const foundConfig = eventConfigs.find((c) => c.event_type === eName);
    if (foundConfig) {
      const autoPayload = generateSamplePayloadForEvent(foundConfig);
      setPayloadStr(autoPayload);
    } else {
      setPayloadStr(JSON.stringify({ event_type: eName || '', data: {} }, null, 2));
    }
  };

  const currentConfig = eventConfigs.find((c) => c.event_type === selectedEventName) || eventConfigs[0];
  const currentUrls = currentConfig
    ? (Array.isArray(currentConfig.target_urls) && currentConfig.target_urls.length
        ? currentConfig.target_urls
        : (Array.isArray(currentConfig.metadata_json?.urls) && currentConfig.metadata_json.urls.length
            ? currentConfig.metadata_json.urls
            : [currentConfig.target_url || '']))
    : [''];

  const copyToClipboard = async (text, type) => {
    const cleanT = cleanCredential(text);
    if (!cleanT) return;
    try {
      await navigator.clipboard.writeText(cleanT);
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

  const handleDispatch = async () => {
    const cleanKey = cleanCredential(apiKey);
    const cleanSec = cleanCredential(secretKey);

    if (!cleanKey || !cleanSec) {
      alert('API Key and Secret Key are required for gateway authentication test.');
      return;
    }

    // Save cleaned credentials to localStorage for this project node
    if (project?.id) {
      localStorage.setItem(`eds_project_${project.id}_api_key`, cleanKey);
      localStorage.setItem(`eds_project_${project.id}_secret_key`, cleanSec);
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch {
      alert('Invalid JSON formatting in Payload field.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data } = await apiClient.post('/v1/gateway/test', {
        api_key: cleanKey,
        secret_key: cleanSec,
        event_type: eventType,
        payload: parsedPayload,
      });
      setResult(data);
    } catch (err) {
      setResult({
        status: 'Failed',
        error: err.response?.data?.detail || err.message || 'Gateway Dispatch Error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasteBothCredentials = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        alert('Clipboard is empty.');
        return;
      }
      let keyVal = '';
      let secretVal = '';

      if (text.includes('API_KEY:') || text.includes('SECRET_KEY:')) {
        const keyMatch = text.match(/API_KEY:\s*([^\s\n,;]+)/i);
        const secretMatch = text.match(/SECRET_KEY:\s*([^\s\n,;]+)/i);
        if (keyMatch) keyVal = cleanCredential(keyMatch[1]);
        if (secretMatch) secretVal = cleanCredential(secretMatch[1]);
      } else {
        const parts = text.split(/[\n,;]+/).map(s => cleanCredential(s)).filter(Boolean);
        if (parts.length >= 2) {
          keyVal = parts[0];
          secretVal = parts[1];
        } else if (parts.length === 1) {
          keyVal = parts[0];
        }
      }

      if (keyVal) {
        setApiKey(keyVal);
        if (project?.id) localStorage.setItem(`eds_project_${project.id}_api_key`, keyVal);
      }
      if (secretVal) {
        setSecretKey(secretVal);
        if (project?.id) localStorage.setItem(`eds_project_${project.id}_secret_key`, secretVal);
      }
    } catch (err) {
      alert('Could not read clipboard automatically. Please paste credentials manually.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 font-sans">
      {/* Left Box: Test Payload Configuration */}
      <div className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md transition-colors">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Webhook Gateway Simulator & HMAC Inspector
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Paste credentials or click 'Auto-Fetch Project Keys' to load live credentials.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleFetchProjectKeys}
              disabled={fetchingKeys}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 transition active:scale-95 disabled:opacity-50"
              title="Auto-fetch current project credentials from server"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetchingKeys ? 'animate-spin' : ''}`} />
              <span>{fetchingKeys ? 'Fetching...' : 'Fetch Project Keys'}</span>
            </button>

            <button
              type="button"
              onClick={handlePasteBothCredentials}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 px-2 py-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 transition active:scale-95"
              title="Paste Both API Key & Secret Key from Clipboard"
            >
              <ClipboardPaste className="h-3.5 w-3.5 text-teal-500" />
              <span>Paste Both</span>
            </button>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* 🔑 Editable Paste Credentials Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
            {/* API Key Paste Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[10px] flex items-center gap-1">
                  <ClipboardPaste className="h-3 w-3 text-emerald-500" />
                  Paste API Key (X-API-KEY)
                </label>
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(apiKey, 'key')}
                    className="text-zinc-400 hover:text-emerald-500 text-[10px] font-sans flex items-center gap-1"
                  >
                    {copiedKey ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-emerald-400 outline-none focus:border-emerald-500"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="Paste API Key copied from Settings..."
              />
            </div>

            {/* Secret Key Paste Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans text-[10px] flex items-center gap-1">
                  <ClipboardPaste className="h-3 w-3 text-cyan-500" />
                  Paste HMAC Secret Key
                </label>
                <div className="flex items-center gap-2 text-[10px] font-sans">
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  {secretKey && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(secretKey, 'secret')}
                      className="text-zinc-400 hover:text-emerald-500 flex items-center gap-1"
                    >
                      {copiedSecret ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
              <input
                type={showSecret ? 'text' : 'password'}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-cyan-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-cyan-400 outline-none focus:border-emerald-500"
                value={secretKey}
                onChange={(e) => handleSecretKeyChange(e.target.value)}
                placeholder="Paste HMAC Secret Key copied from Settings..."
              />
            </div>
          </div>

          {/* 🎯 Smart Event Selector (Auto-populates Default Payload Keys for Selected Event) */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 dark:bg-emerald-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-sans">
                <Sliders className="h-3.5 w-3.5" />
                Select Event (Auto-Populates Default Payload Keys)
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">
                {eventConfigs.length} configured rules
              </span>
            </div>

            <div className="max-h-44 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
              {eventConfigs.length > 0 ? (
                eventConfigs.map((ec) => {
                  const isActive = selectedEventName === ec.event_type;
                  return (
                    <button
                      key={ec.id || ec.event_type}
                      type="button"
                      onClick={() => handleEventSelect(ec.event_type)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs font-mono transition ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="font-semibold">⚡ {ec.event_type}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                        {ec.payload_keys?.length || 1} default schema keys • {ec.target_urls?.length || 1} URLs
                      </div>
                    </button>
                  );
                })
              ) : (
                <>
                  <button type="button" onClick={() => handleEventSelect('order.created')} className="w-full rounded-lg px-3 py-2 text-left text-xs font-mono text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <div className="font-semibold">⚡ order.created</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">Default payload keys</div>
                  </button>
                  <button type="button" onClick={() => handleEventSelect('order.done')} className="w-full rounded-lg px-3 py-2 text-left text-xs font-mono text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <div className="font-semibold">⚡ order.done</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">Default payload keys</div>
                  </button>
                  <button type="button" onClick={() => handleEventSelect('user.signup')} className="w-full rounded-lg px-3 py-2 text-left text-xs font-mono text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <div className="font-semibold">⚡ user.signup</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">Default payload keys</div>
                  </button>
                  <button type="button" onClick={() => handleEventSelect('payment.succeeded')} className="w-full rounded-lg px-3 py-2 text-left text-xs font-mono text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <div className="font-semibold">⚡ payment.succeeded</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">Default payload keys</div>
                  </button>
                </>
              )}
            </div>

            {/* Display Target URLs for selected event */}
            <div className="pt-1 space-y-1 font-mono text-[11px]">
              <div className="text-[10px] uppercase font-bold text-zinc-400 font-sans">Target Endpoints for "{selectedEventName || 'order.created'}":</div>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                {currentUrls.map((u, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 truncate">
                    <Globe className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="truncate">{u}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Event Type Name Header */}
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Event Name / Type Header * (Editable)
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 font-mono text-xs outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-emerald-400 font-extrabold"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="Paste or type event name (e.g. order.created, order.done)"
            />
          </div>

          {/* JSON Payload Editor with Default Schema Reset */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <FileJson className="h-3.5 w-3.5 text-emerald-500" />
                JSON Payload Body (Editable for Custom Schema Validation Testing)
              </label>
              <button
                type="button"
                onClick={() => {
                  const matching = eventConfigs.find((c) => c.event_type === eventType);
                  setPayloadStr(generateSamplePayloadForEvent(matching));
                }}
                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-sans"
                title="Restore original default schema keys for selected event"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset Default Schema Keys</span>
              </button>
            </div>
            <textarea
              rows={7}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 font-mono text-xs text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-emerald-400 leading-relaxed"
              value={payloadStr}
              onChange={(e) => setPayloadStr(e.target.value)}
            />
          </div>

          <button
            type="button"
            disabled={loading || fetchingKeys}
            onClick={handleDispatch}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-6 py-3 font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50 text-xs"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>{loading ? 'Dispatching & Verifying HMAC...' : 'Simulate & Verify Webhook Dispatch'}</span>
          </button>
        </div>
      </div>

      {/* Right Box: Live Dispatch Response & Signature Inspector */}
      <div className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md font-mono text-xs">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <h3 className="text-base font-extrabold font-sans text-zinc-900 dark:text-white flex items-center gap-2">
            <Code2 className="h-5 w-5 text-indigo-500" />
            Gateway Verification Results
          </h3>
          {result && (
            <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
              result.status === 'Failed' || result.error
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
            }`}>
              {result.status || 'Verified'}
            </span>
          )}
        </div>

        {!result ? (
          <div className="flex h-64 flex-col items-center justify-center text-center text-zinc-400 space-y-2">
            <ShieldCheck className="h-10 w-10 text-zinc-500" />
            <p className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans text-xs">No simulation executed yet</p>
            <p className="text-[11px] max-w-xs">Click 'Simulate & Verify Webhook Dispatch' to test signature verification & delivery telemetry.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status Card */}
            <div className={`p-4 rounded-xl border ${
              result.status === 'Failed' || result.error
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            }`}>
              <div className="flex items-center gap-2 font-bold font-sans">
                {result.status === 'Failed' || result.error ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                <span>{result.status === 'Failed' || result.error ? 'Simulation Error' : 'Gateway Verification Successful (200 OK)'}</span>
              </div>
              {result.error && (
                <p className="mt-1 text-[11px] text-rose-500">{result.error}</p>
              )}
            </div>

            {/* Generated Signature */}
            {result.signature && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Computed HMAC Signature (X-EDS-Signature)</label>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-emerald-400 overflow-x-auto text-[11px]">
                  {result.signature}
                </div>
              </div>
            )}

            {/* Response Packet */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Gateway Response Body</label>
              <pre className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 overflow-x-auto max-h-72 leading-relaxed text-[11px]">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
