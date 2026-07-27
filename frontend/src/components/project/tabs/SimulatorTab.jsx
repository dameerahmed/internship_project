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

export default function SimulatorTab({ project }) {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [selectedEventName, setSelectedEventName] = useState('');
  const [eventType, setEventType] = useState('order.created');
  const [payloadStr, setPayloadStr] = useState('{\n  "event_type": "order.created",\n  "order_id": "ord_994821",\n  "amount": 149.99,\n  "currency": "USD"\n}');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetchingKeys, setFetchingKeys] = useState(false);

  const eventConfigs = project?.event_configs || [];

  // Smart Payload Generator from Event Schema Keys
  const generateSamplePayloadForEvent = (eventConfig) => {
    if (!eventConfig) {
      return JSON.stringify({ event_type: 'order.created', order_id: 'ord_994821', amount: 149.99, currency: 'USD' }, null, 2);
    }
    const eventName = eventConfig.event_type || 'webhook.event';
    const keys = eventConfig.payload_keys || eventConfig.metadata_json?.payload_keys || [];
    const types = eventConfig.payload_types || eventConfig.metadata_json?.payload_types || [];
    
    const sampleObj = { event_type: eventName, timestamp: new Date().toISOString() };
    if (keys.length === 0) {
      if (eventName.includes('order')) {
        sampleObj.order_id = 'ord_' + Math.floor(Math.random() * 899999 + 100000);
        sampleObj.amount = 299.00;
        sampleObj.currency = 'USD';
        sampleObj.status = 'completed';
      } else if (eventName.includes('user') || eventName.includes('signup')) {
        sampleObj.user_id = 'usr_' + Math.floor(Math.random() * 899999 + 100000);
        sampleObj.email = 'developer@company.com';
        sampleObj.tier = 'enterprise';
      } else {
        sampleObj.event_id = 'evt_' + Math.floor(Math.random() * 899999 + 100000);
        sampleObj.status = 'processed';
      }
    } else {
      keys.forEach((key, idx) => {
        const kType = (types[idx] || 'string').toLowerCase();
        if (kType === 'number') {
          sampleObj[key] = key.includes('amount') || key.includes('price') ? 149.99 : Math.floor(Math.random() * 900 + 100);
        } else if (kType === 'boolean') {
          sampleObj[key] = true;
        } else if (kType === 'object') {
          sampleObj[key] = { id: 'obj_' + Math.floor(Math.random() * 9000 + 1000), status: 'active' };
        } else if (kType === 'array') {
          sampleObj[key] = ['item_1', 'item_2'];
        } else {
          if (key.includes('email')) sampleObj[key] = 'user.sample@company.com';
          else if (key.includes('id')) sampleObj[key] = key + '_' + Math.floor(Math.random() * 899999 + 100000);
          else sampleObj[key] = `${key}_value_${Math.floor(Math.random() * 1000)}`;
        }
      });
    }
    return JSON.stringify(sampleObj, null, 2);
  };

  // Auto populate keys on load
  useEffect(() => {
    const loadKeys = async () => {
      if (!project?.id) return;
      setFetchingKeys(true);
      try {
        const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
        if (data?.api_key) setApiKey(data.api_key);
        if (data?.secret_key) setSecretKey(data.secret_key);
      } catch (err) {
        console.warn('Could not auto-fetch project test credentials:', err);
      } finally {
        setFetchingKeys(false);
      }
    };

    loadKeys();
  }, [project?.id]);

  // Set default selected event if configs available
  useEffect(() => {
    if (eventConfigs.length > 0 && !selectedEventName) {
      const first = eventConfigs[0];
      setSelectedEventName(first.event_type);
      setEventType(first.event_type);
      setPayloadStr(generateSamplePayloadForEvent(first));
    }
  }, [eventConfigs]);

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
      if (eName === 'order.created' || eName === 'order.done') {
        setPayloadStr(JSON.stringify({ event_type: eName, order_id: 'ord_994821', amount: 149.99, currency: 'USD' }, null, 2));
      } else if (eName === 'user.signup') {
        setPayloadStr(JSON.stringify({ event_type: eName, user_id: 'usr_882910', email: 'user@example.com', tier: 'enterprise' }, null, 2));
      } else if (eName === 'payment.succeeded') {
        setPayloadStr(JSON.stringify({ event_type: eName, payment_intent: 'pi_3MtwB2', status: 'succeeded', amount_received: 5000 }, null, 2));
      } else {
        setPayloadStr(JSON.stringify({ event_type: eName, timestamp: new Date().toISOString(), status: 'active' }, null, 2));
      }
    }
  };

  const currentConfig = eventConfigs.find(c => c.event_type === selectedEventName) || eventConfigs[0];
  const currentUrls = currentConfig
    ? (Array.isArray(currentConfig.target_urls) && currentConfig.target_urls.length
        ? currentConfig.target_urls
        : (Array.isArray(currentConfig.metadata_json?.urls) && currentConfig.metadata_json.urls.length
            ? currentConfig.metadata_json.urls
            : [currentConfig.target_url || 'https://example.com/webhook']))
    : ['https://example.com/webhook'];

  const copyToClipboard = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleDispatch = async () => {
    if (!apiKey || !secretKey) {
      alert('API Key and Secret Key are required for gateway authentication test.');
      return;
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
        api_key: apiKey,
        secret_key: secretKey,
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
              Paste credentials from Settings, select event to auto-populate default keys, or edit custom payload to test validation
            </p>
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
                onChange={(e) => setApiKey(e.target.value)}
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
                onChange={(e) => setSecretKey(e.target.value)}
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

            <select
              value={selectedEventName}
              onChange={(e) => handleEventSelect(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 font-mono text-xs text-zinc-900 font-bold outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white cursor-pointer"
            >
              {eventConfigs.length > 0 ? (
                eventConfigs.map((ec) => (
                  <option key={ec.id || ec.event_type} value={ec.event_type}>
                    ⚡ {ec.event_type} ({ec.payload_keys?.length || 1} default schema keys • {ec.target_urls?.length || 1} URLs)
                  </option>
                ))
              ) : (
                <>
                  <option value="order.created">⚡ order.created (Default Payload Keys)</option>
                  <option value="order.done">⚡ order.done (Default Payload Keys)</option>
                  <option value="user.signup">⚡ user.signup (Default Payload Keys)</option>
                  <option value="payment.succeeded">⚡ payment.succeeded (Default Payload Keys)</option>
                </>
              )}
            </select>

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
