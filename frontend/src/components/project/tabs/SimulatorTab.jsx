import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  KeyRound, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
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
  FileJson,
  Clock,
  Key,
  Layers,
  Sparkles,
  Terminal
} from 'lucide-react';
import apiClient from '@/api/client';
import { normalizeEventConfigs } from '@/utils/eventConfigUtils';

export default function SimulatorTab({ project }) {
  // Injector Mode: 'both' (Both Keys Combined Paste Box) | 'single' (Individual Inputs)
  const [injectorMode, setInjectorMode] = useState('both');

  // Input states (automatically wiped on paste)
  const [combinedBothInput, setCombinedBothInput] = useState('');
  const [singleApiKeyInput, setSingleApiKeyInput] = useState('');
  const [singleSecretKeyInput, setSingleSecretKeyInput] = useState('');

  // Active Cookie Status & Timer States
  const [activeApiKeyPreview, setActiveApiKeyPreview] = useState(null);
  const [activeSecretKeyPreview, setActiveSecretKeyPreview] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const [selectedEventName, setSelectedEventName] = useState('');
  const [eventType, setEventType] = useState('');
  const [payloadStr, setPayloadStr] = useState(JSON.stringify({}, null, 2));
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedHeaders, setCopiedHeaders] = useState(false);

  const eventConfigs = normalizeEventConfigs(project?.event_configs || []);

  // Helper to read cookie by name
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  const handleClearCookies = () => {
    document.cookie = 'eds_sim_api_key=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'eds_sim_secret_key=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'eds_sim_ui_expiry=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    setActiveApiKeyPreview(null);
    setActiveSecretKeyPreview(null);
    setTimerSeconds(0);
    setFeedbackMsg('✓ Stored simulator cookies cleared! Auto-resolving project keys.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  // Helper to set cookie (Clears previous cookie first, updates cleanly for 7 days)
  const setSimCookie = (name, val) => {
    if (!val) return;
    const cleanVal = String(val).trim().replace(/^[{"'\s,:]+/, '').replace(/[\s},:]+$/, '').replace(/^["']|["']$/g, '');
    
    // 1. Wipe previous cookie first
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
    
    // 2. Set new cookie with 7-day max-age
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(cleanVal)}; expires=${expires}; path=/; SameSite=Lax`;
    
    // 3. Set UI Countdown Expiry (60s)
    const uiExpiryTime = Date.now() + 60 * 1000;
    const uiExpires = new Date(uiExpiryTime).toUTCString();
    document.cookie = `eds_sim_ui_expiry=${uiExpiryTime}; expires=${uiExpires}; max-age=60; path=/; SameSite=Lax`;
  };

  const makePreview = (str) => {
    if (!str) return null;
    const clean = str.trim().replace(/^["']|["']$/g, '');
    return clean.length > 12 ? `${clean.substring(0, 6)}...${clean.substring(clean.length - 4)}` : '••••••••';
  };

  // Robust Key Extractor & Sanitizer
  const parseKeysFromText = (rawText) => {
    if (!rawText || !rawText.trim()) return { apiKey: null, secretKey: null };
    const cleanText = rawText.trim();
    let apiKey = null;
    let secretKey = null;

    // 1. Try parsing JSON
    try {
      if (cleanText.includes('{') && cleanText.includes('}')) {
        const jsonStr = cleanText.substring(cleanText.indexOf('{'), cleanText.lastIndexOf('}') + 1);
        const json = JSON.parse(jsonStr);
        if (typeof json === 'object' && json !== null) {
          apiKey = json.api_key || json.apiKey || json.key || json.public_key || json.X_API_KEY;
          secretKey = json.secret_key || json.secretKey || json.secret || json.private_key || json.X_HUB_SIGNATURE;
        }
      }
    } catch {
      // Continue to string parsing
    }

    // 2. Key-value string parsing
    if (!apiKey) {
      const apiMatch = cleanText.match(/(?:api_key|apiKey|public_key|x-api-key)[\s"':=]+([A-Za-z0-9_=+/.-]+)/i) ||
                       cleanText.match(/(gw_live:[A-Za-z0-9_=+/.-]+:[A-Za-z0-9_=+/.-]+:[A-Za-z0-9_=+/.-]+)/i) ||
                       cleanText.match(/(gAAAA[A-Za-z0-9_=+/.-]+)/i);
      if (apiMatch) apiKey = apiMatch[1] || apiMatch[0];
    }

    if (!secretKey) {
      const secMatch = cleanText.match(/(?:secret_key|secretKey|secret|private_key|x-hub-signature)[\s"':=]+([A-Za-z0-9_=+/.-]+)/i) ||
                       cleanText.match(/(whsec_[A-Za-z0-9_=+/.-]+)/i);
      if (secMatch) secretKey = secMatch[1] || secMatch[0];
    }


    // 3. Line-by-line fallback
    if (!apiKey || !secretKey) {
      const tokens = cleanText.split(/[\r\n,\s;]+/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      tokens.forEach((token) => {
        if (!apiKey && (token.startsWith('gw_live:') || token.startsWith('gAAAAA') || token.startsWith('gAAAA') || token.startsWith('eds_live_ak_'))) {
          apiKey = token;
        } else if (!secretKey && token.startsWith('whsec_')) {
          secretKey = token;
        }
      });

      if (!apiKey && tokens.length >= 1) apiKey = tokens[0];
      if (!secretKey && tokens.length >= 2) secretKey = tokens[1];
    }

    if (apiKey) apiKey = apiKey.trim().replace(/^[{"'\s,:]+/, '').replace(/[\s},:]+$/, '');
    if (secretKey) secretKey = secretKey.trim().replace(/^[{"'\s,:]+/, '').replace(/[\s},:]+$/, '');

    return { apiKey, secretKey };
  };

  // 1. COMBINED BOTH KEYS PASTE PARSER & INJECTOR
  const handleBothKeysPaste = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const { apiKey, secretKey } = parseKeysFromText(rawText);

    if (apiKey) {
      setSimCookie('eds_sim_api_key', apiKey);
      setActiveApiKeyPreview(makePreview(apiKey));
    }
    if (secretKey) {
      setSimCookie('eds_sim_secret_key', secretKey);
      setActiveSecretKeyPreview(makePreview(secretKey));
    }

    setTimerSeconds(60);
    setCombinedBothInput('');
    setFeedbackMsg('✓ Both API Key & Webhook Secret updated into Cookies! UI preview auto-hides in 60s.');
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  // 2. INDIVIDUAL KEY PASTES
  const handleSingleApiKeyPaste = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const cleanText = rawText.trim().replace(/^[{"'\s,:]+/, '').replace(/[\s},:]+$/, '').replace(/^["']|["']$/g, '');
    setSimCookie('eds_sim_api_key', cleanText);
    setActiveApiKeyPreview(makePreview(cleanText));
    setTimerSeconds(60);
    setSingleApiKeyInput('');
    setFeedbackMsg('✓ API Key updated in Cookie! UI preview auto-hides in 60s.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  const handleSingleSecretKeyPaste = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const cleanText = rawText.trim().replace(/^[{"'\s,:]+/, '').replace(/[\s},:]+$/, '').replace(/^["']|["']$/g, '');
    setSimCookie('eds_sim_secret_key', cleanText);
    setActiveSecretKeyPreview(makePreview(cleanText));
    setTimerSeconds(60);
    setSingleSecretKeyInput('');
    setFeedbackMsg('✓ Webhook Secret updated in Cookie! UI preview auto-hides in 60s.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };


  // 60-Second UI Preview Countdown Interval & Auto Cookie Population
  useEffect(() => {
    let apiKeyCookie = getCookie('eds_sim_api_key');
    let secretKeyCookie = getCookie('eds_sim_secret_key');
    const uiExpiryCookie = getCookie('eds_sim_ui_expiry');

    if (!apiKeyCookie && project?.id) {
      apiClient.get(`/v1/projects/refresh_keys/${project.id}`)
        .then(({ data }) => {
          if (data?.api_key) {
            setSimCookie('eds_sim_api_key', data.api_key);
            setActiveApiKeyPreview(makePreview(data.api_key));
          }
          if (data?.secret_key) {
            setSimCookie('eds_sim_secret_key', data.secret_key);
            setActiveSecretKeyPreview(makePreview(data.secret_key));
          }
          setTimerSeconds(60);
        })
        .catch((err) => console.warn('Auto key sync note:', err));
    } else {
      if (apiKeyCookie) {
        setActiveApiKeyPreview(makePreview(decodeURIComponent(apiKeyCookie)));
      }
      if (secretKeyCookie) {
        setActiveSecretKeyPreview(makePreview(decodeURIComponent(secretKeyCookie)));
      }
    }

    let initialSeconds = 0;
    if (uiExpiryCookie) {
      const remainingMs = Number(uiExpiryCookie) - Date.now();
      initialSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    }

    setTimerSeconds(initialSeconds);

    if (initialSeconds <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [project?.id]);


  // Build sample payload from event schema
  const generateSamplePayloadForEvent = (eventConfig) => {
    const keys = eventConfig?.payload_keys || eventConfig?.metadata_json?.payload_keys || [];
    const types = eventConfig?.payload_types || eventConfig?.metadata_json?.payload_types || [];

    const sampleObj = {};
    if (keys.length === 0) {
      return JSON.stringify({ event: eventConfig?.event_type || '', data: {} }, null, 2);
    }

    keys.forEach((key, idx) => {
      const kType = (types[idx] || 'string').toLowerCase();
      if (kType === 'number') sampleObj[key] = 0;
      else if (kType === 'boolean') sampleObj[key] = false;
      else if (kType === 'object') sampleObj[key] = {};
      else if (kType === 'array') sampleObj[key] = [];
      else sampleObj[key] = '';
    });

    return JSON.stringify(sampleObj, null, 2);
  };

  // Default event selection
  useEffect(() => {
    if (eventConfigs.length > 0 && !selectedEventName) {
      const first = eventConfigs[0];
      setSelectedEventName(first.event_type);
      setEventType(first.event_type);
      setPayloadStr(generateSamplePayloadForEvent(first));
    }
  }, [eventConfigs, selectedEventName]);

  const handleEventSelect = (eName) => {
    setSelectedEventName(eName);
    if (!eName) return;
    setEventType(eName);

    const foundConfig = eventConfigs.find((c) => c.event_type === eName);
    if (foundConfig) {
      setPayloadStr(generateSamplePayloadForEvent(foundConfig));
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

  const validatePayloadSchema = (payload, reqKeys, reqTypes) => {
    if (!reqKeys || reqKeys.length === 0) return { valid: true };
    if (typeof payload !== 'object' || payload === null) return { valid: false, error: 'Payload must be a valid JSON object' };
    const missing = [];
    const mismatched = [];
    reqKeys.forEach((keyPath, idx) => {
      const parts = String(keyPath).split('.').filter(Boolean);
      let curr = payload;
      let found = true;
      for (const part of parts) {
        if (curr && typeof curr === 'object' && part in curr) {
          curr = curr[part];
        } else {
          found = false;
          break;
        }
      }
      if (!found) {
        missing.push(keyPath);
      } else if (reqTypes && reqTypes[idx]) {
        const expected = String(reqTypes[idx]).toLowerCase();
        const actual = Array.isArray(curr) ? 'array' : typeof curr;
        if (expected !== 'any' && expected !== '') {
          if (expected === 'string' && typeof curr !== 'string') mismatched.push(`${keyPath} (expected string, got ${actual})`);
          else if ((expected === 'number' || expected === 'integer') && (typeof curr !== 'number' || isNaN(curr))) mismatched.push(`${keyPath} (expected ${expected}, got ${actual})`);
          else if (expected === 'boolean' && typeof curr !== 'boolean') mismatched.push(`${keyPath} (expected boolean, got ${actual})`);
          else if (expected === 'object' && (typeof curr !== 'object' || Array.isArray(curr))) mismatched.push(`${keyPath} (expected object, got ${actual})`);
          else if (expected === 'array' && !Array.isArray(curr)) mismatched.push(`${keyPath} (expected array, got ${actual})`);
        }
      }
    });
    if (missing.length > 0 || mismatched.length > 0) {
      return {
        valid: false,
        error: `Payload Validation Warning: ${missing.length ? 'Missing keys: ' + missing.join(', ') : ''} ${mismatched.length ? 'Type mismatch: ' + mismatched.join(', ') : ''}`
      };
    }
    return { valid: true };
  };

  const handleDispatch = async () => {
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch {
      alert('Invalid JSON formatting in Payload field.');
      return;
    }

    setLoading(true);
    setResult(null);

    const reqKeys = currentConfig?.payload_keys || currentConfig?.metadata_json?.payload_keys || [];
    const reqTypes = currentConfig?.payload_types || currentConfig?.metadata_json?.payload_types || [];
    const schemaVal = validatePayloadSchema(parsedPayload, reqKeys, reqTypes);

    // Read active keys directly from 60s cookies
    const rawApiKey = getCookie('eds_sim_api_key');
    const rawSecretKey = getCookie('eds_sim_secret_key');

    let apiKey = rawApiKey ? decodeURIComponent(rawApiKey) : null;
    let secretKey = rawSecretKey ? decodeURIComponent(rawSecretKey) : null;

    if ((!apiKey || !secretKey) && project?.id) {
      try {
        const { data: keysData } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
        if (keysData?.api_key) apiKey = keysData.api_key;
        if (keysData?.secret_key) secretKey = keysData.secret_key;
      } catch {
        // Fallback handled by backend
      }
    }

    try {
      const { data } = await apiClient.post('/v1/gateway/test', {
        api_key: apiKey,
        secret_key: secretKey,
        event_type: eventType,
        payload: parsedPayload,
      });
      if (!schemaVal.valid) {
        data.schema_warning = schemaVal.error;
      }
      setResult(data);
    } catch (err) {
      setResult({
        status: 'Failed',
        error: err.response?.data?.detail || err.message || 'Gateway Dispatch Error',
        schema_warning: !schemaVal.valid ? schemaVal.error : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 font-sans select-none pb-8">
      
      {/* 👈 LEFT PANEL: TEST PAYLOAD & CREDENTIAL CONFIGURATION */}
      <div className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md">
        
        {/* Title */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Webhook Gateway Simulator & HMAC Inspector
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Paste credentials into 60s cookies below, select configured event rules, and test signature validation.
            </p>
          </div>
        </div>

        {/* 🔐 EPHEMERAL DUAL-CREDENTIAL INJECTOR (60s COOKIES) */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4 dark:bg-amber-950/20 shadow-inner">
          
          <div className="flex flex-wrap items-center justify-between border-b border-amber-500/20 pb-3 gap-2">
            <h4 className="text-xs font-extrabold text-amber-600 dark:text-amber-300 flex items-center gap-2 uppercase tracking-wider font-mono">
              <Key className="h-4 w-4 text-amber-500" />
              Ephemeral Credential Injector (60s Cookies)
            </h4>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-1 bg-white dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setInjectorMode('both')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  injectorMode === 'both'
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Paste Both Keys Together
              </button>
              <button
                type="button"
                onClick={() => setInjectorMode('single')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  injectorMode === 'single'
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Individual Fields
              </button>
            </div>
          </div>

          {/* Active Cookies Status Bar */}
          <div className="flex flex-wrap items-center justify-between text-[11px] font-mono gap-2 pt-1">
            <div className="flex items-center gap-3">
              <span>API Key: <strong className="text-amber-600 dark:text-amber-300">{timerSeconds > 0 ? (activeApiKeyPreview || 'Default System Key') : (activeApiKeyPreview ? '•••••••• (Cookie Active)' : 'Default System Key')}</strong></span>
              <span>Secret Key: <strong className="text-amber-600 dark:text-amber-300">{timerSeconds > 0 ? (activeSecretKeyPreview || 'Default System Secret') : (activeSecretKeyPreview ? '•••••••• (Cookie Active)' : 'Default System Secret')}</strong></span>
            </div>

            <div className="flex items-center gap-2">
              {(activeApiKeyPreview || activeSecretKeyPreview) && (
                <button
                  type="button"
                  onClick={handleClearCookies}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-[10px] font-bold border border-rose-500/30 transition"
                  title="Wipe custom cookies and restore default project keys"
                >
                  Reset Cookies
                </button>
              )}
              {timerSeconds > 0 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold animate-pulse">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Unmasked: {timerSeconds}s remaining</span>
                </div>
              ) : (
                <span className="text-zinc-500 text-[10px]">Masked in UI (Cookies Active in Background)</span>
              )}
            </div>
          </div>


          {/* Mode 1: Combined Both Keys Paste Box */}
          {injectorMode === 'both' && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-mono">
                PASTE BOTH KEYS AT ONCE (RAW TEXT OR JSON)
              </label>
              <input
                type="text"
                value={combinedBothInput}
                onChange={(e) => {
                  setCombinedBothInput(e.target.value);
                  if (e.target.value.length > 10) handleBothKeysPaste(e.target.value);
                }}
                onPaste={(e) => {
                  const data = e.clipboardData.getData('text');
                  handleBothKeysPaste(data);
                }}
                placeholder='Paste keys here... e.g. { "api_key": "gw_live:...", "secret_key": "whsec_..." }'
                className="w-full rounded-xl border border-amber-500/40 bg-white px-3 py-2 text-xs font-mono text-amber-700 dark:bg-zinc-950 dark:text-amber-200 outline-none focus:border-amber-500 shadow-inner"
              />
            </div>
          )}


          {/* Mode 2: Individual Key Paste Fields */}
          {injectorMode === 'single' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-sans">
                  PASTE API KEY (X-API-KEY)
                </label>
                <input
                  type="password"
                  value={singleApiKeyInput}
                  onChange={(e) => {
                    setSingleApiKeyInput(e.target.value);
                    if (e.target.value.length > 5) handleSingleApiKeyPaste(e.target.value);
                  }}
                  onPaste={(e) => {
                    const data = e.clipboardData.getData('text');
                    handleSingleApiKeyPaste(data);
                  }}
                  placeholder="Paste API Key here (auto-wipes into Cookie)..."
                  className="w-full rounded-xl border border-amber-500/40 bg-white px-3 py-2 text-xs font-mono text-amber-700 dark:bg-zinc-950 dark:text-amber-200 outline-none focus:border-amber-500 shadow-inner"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-sans">
                  PASTE HMAC SECRET KEY
                </label>
                <input
                  type="password"
                  value={singleSecretKeyInput}
                  onChange={(e) => {
                    setSingleSecretKeyInput(e.target.value);
                    if (e.target.value.length > 5) handleSingleSecretKeyPaste(e.target.value);
                  }}
                  onPaste={(e) => {
                    const data = e.clipboardData.getData('text');
                    handleSingleSecretKeyPaste(data);
                  }}
                  placeholder="Paste Secret Key here (auto-wipes into Cookie)..."
                  className="w-full rounded-xl border border-amber-500/40 bg-white px-3 py-2 text-xs font-mono text-amber-700 dark:bg-zinc-950 dark:text-amber-200 outline-none focus:border-amber-500 shadow-inner"
                />
              </div>
            </div>
          )}

          {feedbackMsg && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>{feedbackMsg}</span>
            </div>
          )}
        </div>

        {/* 🎯 Smart Event Selector */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-sans">
              <Sliders className="h-3.5 w-3.5 text-indigo-500" />
              Select Event (Auto-Populates Default Schema Keys)
            </label>
            <span className="text-[10px] text-zinc-400 font-mono">
              {eventConfigs.length} configured rules
            </span>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900 space-y-1">
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
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border-l-2 border-amber-500'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span>{ec.event_type}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-sans pl-5">
                      {ec.payload_keys?.length || 1} default schema keys • {ec.target_urls?.length || 1} target URLs
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-zinc-400">
                No configured rules found. Type custom event name below.
              </div>
            )}
          </div>

          {currentUrls.length > 0 && currentUrls[0] && (
            <div className="pt-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span>Target URL: <strong className="text-zinc-700 dark:text-zinc-300">{currentUrls[0]}</strong></span>
            </div>
          )}
        </div>

        {/* Event Name Input */}
        <div className="space-y-1.5 text-xs">
          <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
            EVENT NAME / TYPE HEADER * (EDITABLE)
          </label>
          <input
            type="text"
            required
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
          />
        </div>

        {/* JSON Payload Body */}
        <div className="space-y-1.5 text-xs flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
              JSON PAYLOAD BODY (EDITABLE FOR SCHEMA VALIDATION TESTING)
            </label>
            <button
              type="button"
              onClick={() => {
                if (currentConfig) setPayloadStr(generateSamplePayloadForEvent(currentConfig));
              }}
              className="text-[10px] text-amber-500 hover:underline flex items-center gap-1 font-mono"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Reset Default Schema Keys</span>
            </button>
          </div>

          <textarea
            rows={8}
            value={payloadStr}
            onChange={(e) => setPayloadStr(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs text-amber-300 outline-none focus:border-amber-500 shadow-inner resize-y leading-relaxed"
          />
        </div>

        {/* Dispatch Action Button */}
        <button
          type="button"
          onClick={handleDispatch}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-600 hover:bg-amber-500 px-6 py-3.5 text-xs font-bold text-white shadow-lg shadow-amber-600/20 transition active:scale-95 disabled:opacity-50"
        >
          <Play className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Simulating Webhook Dispatch...' : 'Simulate & Verify Webhook Dispatch (Reads 60s Cookies)'}</span>
        </button>
      </div>

      {/* 👉 RIGHT PANEL: GATEWAY VERIFICATION RESULTS */}
      <div className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md min-h-[520px]">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
            <Code2 className="h-5 w-5 text-indigo-500" />
            Gateway Verification Results
          </h3>
        </div>

        {!result ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400 text-xs my-auto space-y-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-400">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div>
              <h4 className="font-bold text-zinc-700 dark:text-zinc-300 text-sm">No Simulation Executed Yet</h4>
              <p className="text-zinc-500 text-xs mt-1 max-w-xs leading-relaxed font-mono">
                Click "Simulate & Verify Webhook Dispatch" to test signature verification & delivery telemetry.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 text-xs font-mono">
            {/* Status Header */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              result.status === 'Failed' || result.error
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <div className="flex items-center gap-2 font-extrabold text-sm">
                {result.status === 'Failed' || result.error ? (
                  <AlertCircle className="h-5 w-5 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )}
                <span>Status: {result.status || 'Success'}</span>
              </div>
              {result.latency_ms && <span className="text-zinc-400 text-xs">{result.latency_ms} ms</span>}
            </div>

            {/* Schema Validation Warning Alert */}
            {result.schema_warning && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-start gap-2 text-xs font-sans">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{result.schema_warning}</span>
              </div>
            )}

            {/* Generated Signature telemetry */}
            {result.signature && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider font-sans">
                  COMPUTED HMAC SIGNATURE (X-GATEWAY-SIGNATURE)
                </label>
                <pre className="p-3.5 rounded-2xl bg-zinc-950 text-amber-300 overflow-x-auto text-[11px] border border-zinc-800">
                  {result.signature}
                </pre>
              </div>
            )}

            {/* Downstream Payload Response */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider font-sans">
                RESPONSE TELEMETRY BODY
              </label>
              <pre className="p-4 rounded-2xl bg-zinc-950 text-emerald-400 overflow-x-auto max-h-80 text-[11px] border border-zinc-800 leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
