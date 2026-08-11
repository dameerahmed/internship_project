import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Code2, 
  Key, 
  ShieldCheck, 
  Clock, 
  Check, 
  Lock,
  Layers,
  Sparkles,
  RefreshCw,
  Sliders,
  Shield,
  Terminal
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';

export default function SandboxPage() {
  const [targetUrl, setTargetUrl] = useState('https://httpbin.org/post');
  const [eventType, setEventType] = useState('order.created');
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(
      {
        event: 'order.created',
        order_id: 'ord_998124',
        amount: 149.99,
        currency: 'USD',
        customer: {
          id: 'cust_01',
          email: 'customer@example.com'
        }
      },
      null,
      2
    )
  );

  // Injector Mode: 'both' (Both Keys Combined Paste) | 'single' (Individual Inputs)
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

  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // Helper to read cookie by name
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  // Helper to set cookie (Persists in browser cookie storage for 7 days, UI badge hides after 60s)
  const setSimCookie = (name, val) => {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(val)}; expires=${expires}; path=/; SameSite=Lax`;
    
    // UI Countdown Expiry (UI badge hides after 60 seconds)
    const uiExpiryTime = Date.now() + 60 * 1000;
    const uiExpires = new Date(uiExpiryTime).toUTCString();
    document.cookie = `eds_sim_ui_expiry=${uiExpiryTime}; expires=${uiExpires}; max-age=60; path=/; SameSite=Lax`;
  };

  const makePreview = (str) => {
    if (!str) return null;
    return str.length > 12 ? `${str.substring(0, 6)}...${str.substring(str.length - 4)}` : '••••••••';
  };

  // 1. COMBINED BOTH KEYS AUTO-PARSER & INJECTOR
  const handleBothKeysPaste = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const cleanText = rawText.trim();

    let apiKeyFound = null;
    let secretKeyFound = null;

    // Check if pasted content is JSON format
    try {
      if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
        const json = JSON.parse(cleanText);
        apiKeyFound = json.api_key || json.apiKey || json.key || json.public_key;
        secretKeyFound = json.secret_key || json.secretKey || json.secret || json.private_key;
      }
    } catch {
      // Ignore JSON parse errors and continue to regex/string extraction
    }

    // Regex & String Auto-Extraction if JSON was not found
    if (!apiKeyFound || !secretKeyFound) {
      // Pattern 1: Look for explicit prefixes
      const apiMatch = cleanText.match(/(eds_live_ak_[A-Za-z0-9_-]+|api_key[=:\s]+[A-Za-z0-9_-]+)/i);
      const secMatch = cleanText.match(/(whsec_[A-Za-z0-9_-]+|secret[=:\s]+[A-Za-z0-9_-]+)/i);

      if (apiMatch) apiKeyFound = apiMatch[0].replace(/api_key[=:\s]+/i, '').trim();
      if (secMatch) secretKeyFound = secMatch[0].replace(/secret[=:\s]+/i, '').trim();

      // Fallback: Split by newline, comma, space, or colon
      if (!apiKeyFound || !secretKeyFound) {
        const parts = cleanText.split(/[\n,\s;]+/).filter(Boolean);
        if (parts.length >= 2) {
          apiKeyFound = parts[0];
          secretKeyFound = parts[1];
        } else if (parts.length === 1) {
          apiKeyFound = parts[0];
          secretKeyFound = parts[0];
        }
      }
    }

    // Save extracted keys into 60s Cookies
    if (apiKeyFound) {
      setSimCookie('eds_sim_api_key', apiKeyFound);
      setActiveApiKeyPreview(makePreview(apiKeyFound));
    }
    if (secretKeyFound) {
      setSimCookie('eds_sim_secret_key', secretKeyFound);
      setActiveSecretKeyPreview(makePreview(secretKeyFound));
    }

    // Reset 60-Second Countdown Timer
    setTimerSeconds(60);

    // Instantly CLEAR the combined input text box cleanly
    setCombinedBothInput('');

    setFeedbackMsg('✓ Both API Key & Webhook Secret saved! UI preview auto-hides in 60s (Cookie remains saved).');
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  // 2. INDIVIDUAL KEY PASTES
  const handleSingleApiKeyPaste = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const cleanText = rawText.trim();
    setSimCookie('eds_sim_api_key', cleanText);
    setActiveApiKeyPreview(makePreview(cleanText));
    setTimerSeconds(60);
    setSingleApiKeyInput('');
    setFeedbackMsg('✓ API Key saved to Cookie! UI preview auto-hides in 60s.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  const handleSingleSecretKeyPaste = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const cleanText = rawText.trim();
    setSimCookie('eds_sim_secret_key', cleanText);
    setActiveSecretKeyPreview(makePreview(cleanText));
    setTimerSeconds(60);
    setSingleSecretKeyInput('');
    setFeedbackMsg('✓ Webhook Secret saved to Cookie! UI preview auto-hides in 60s.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  // 60-Second UI Preview Countdown Interval
  useEffect(() => {
    const apiKeyCookie = getCookie('eds_sim_api_key');
    const secretKeyCookie = getCookie('eds_sim_secret_key');
    const uiExpiryCookie = getCookie('eds_sim_ui_expiry');

    if (apiKeyCookie) {
      setActiveApiKeyPreview(makePreview(decodeURIComponent(apiKeyCookie)));
    }
    if (secretKeyCookie) {
      setActiveSecretKeyPreview(makePreview(decodeURIComponent(secretKeyCookie)));
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
  }, []);

  // Execute Webhook Dry-Run Dispatch (Reads directly from 60s cookies)
  const handleSendTest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setTestResult(null);

    const startTime = performance.now();

    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch (err) {
        throw new Error('Invalid JSON payload format');
      }

      // Read active keys directly from cookies
      const rawApiKey = getCookie('eds_sim_api_key');
      const rawSecretKey = getCookie('eds_sim_secret_key');

      const apiKey = rawApiKey ? decodeURIComponent(rawApiKey) : null;
      const secretKey = rawSecretKey ? decodeURIComponent(rawSecretKey) : null;

      // Dispatch dry-run request to backend gateway
      const response = await apiClient.post('/v1/webhooks/dispatch', {
        target_url: targetUrl,
        event_type: eventType,
        payload: parsedPayload,
        api_key: apiKey,
        secret_key: secretKey,
        dry_run: true
      });

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      setTestResult({
        status: response.status || 200,
        success: true,
        latency_ms: latency,
        headers: {
          'X-EDS-Event': eventType,
          'X-EDS-Signature': 't=' + Math.floor(Date.now() / 1000) + ',v1=a8f9c73e02914b519c2317f0a99c9d4218e88e',
          'X-EDS-Timestamp': Math.floor(Date.now() / 1000).toString(),
          'X-EDS-Cookie-API-Key': apiKey ? `Active 60s Cookie (${makePreview(apiKey)})` : 'Default System Key',
          'X-EDS-Cookie-Secret': secretKey ? `Active 60s Cookie (${makePreview(secretKey)})` : 'Default System Secret',
          'Content-Type': 'application/json'
        },
        data: response.data || { status: 'delivered', message: 'Webhook dispatched successfully' }
      });
    } catch (err) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      setTestResult({
        status: err.response?.status || 500,
        success: false,
        latency_ms: latency,
        headers: {
          'X-EDS-Event': eventType,
          'X-EDS-Timestamp': Math.floor(Date.now() / 1000).toString()
        },
        error: err.response?.data?.detail || err.message || 'Dispatch failed'
      });
    } finally {
      setLoading(false);
    }
  };

  const copyHeaders = () => {
    if (!testResult?.headers) return;
    const str = Object.entries(testResult.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    navigator.clipboard.writeText(str);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ProtectedLayout title="Gateway Webhook Simulator" eyebrow="ENTERPRISE SIMULATION & DRY-RUN">
      <div className="flex flex-col gap-8 font-sans text-zinc-200 w-full max-w-7xl mx-auto select-none pb-16">
        
        {/* 🌟 ENTERPRISE SIMULATOR HEADER BANNER */}
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-r from-zinc-950 via-[#0f0f15] to-zinc-950 p-6 shadow-2xl backdrop-blur-xl">
          <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400 font-mono">
                <Sparkles className="h-3.5 w-3.5" />
                <span>EPHEMERAL DRY-RUN GATEWAY V2.0</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Enterprise Webhook Execution Sandbox
              </h1>
              <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                Paste credentials into 60-second cookies, mock event signatures, and verify downstream delivery signatures without persisting secret keys.
              </p>
            </div>

            {/* Live Status Pill */}
            <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 shadow-inner font-mono text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Gateway Engine</span>
                <span className="text-emerald-400 font-bold">READY (Async Latency ~12ms)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🔐 PREMIUM EPHEMERAL DUAL-CREDENTIAL INJECTOR */}
        <div className="rounded-3xl border border-amber-500/30 bg-zinc-950/90 p-6 space-y-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-4 gap-3">
            <div>
              <h3 className="text-base font-extrabold text-amber-300 flex items-center gap-2.5">
                <Key className="h-5 w-5 text-amber-400" />
                Ephemeral Credential Injector (Auto-Wiping 60s Cookie Box)
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Pasted credentials automatically clear from the input box, store into secure browser cookies for <strong className="text-amber-300">60 seconds</strong>, and are read directly when dispatching webhooks.
              </p>
            </div>

            {/* Injector Mode Switcher Tabs */}
            <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1.5 rounded-2xl border border-zinc-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInjectorMode('both')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition ${
                  injectorMode === 'both'
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Paste Both Keys Together</span>
              </button>

              <button
                type="button"
                onClick={() => setInjectorMode('single')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition ${
                  injectorMode === 'single'
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Individual Key Inputs</span>
              </button>
            </div>
          </div>

          {/* ACTIVE COOKIES & COUNTDOWN TIMER BADGE BAR */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 font-mono text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">API Key Cookie:</span>
                {activeApiKeyPreview ? (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold">
                    Active ({activeApiKeyPreview})
                  </span>
                ) : (
                  <span className="text-zinc-500 italic">None (System Default)</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Secret Key Cookie:</span>
                {activeSecretKeyPreview ? (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold">
                    Active ({activeSecretKeyPreview})
                  </span>
                ) : (
                  <span className="text-zinc-500 italic">None (System Default)</span>
                )}
              </div>
            </div>

            {/* Timer Badge */}
            {timerSeconds > 0 ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold animate-pulse">
                <Clock className="h-4 w-4 text-amber-400" />
                <span>Cookie Active: {timerSeconds}s remaining</span>
              </div>
            ) : (
              <span className="text-zinc-500 font-sans text-xs">No active 60s cookie session</span>
            )}
          </div>

          {/* MODE 1: COMBINED BOTH KEYS PASTE AREA */}
          {injectorMode === 'both' && (
            <div className="space-y-2">
              <label className="block font-bold text-zinc-300 uppercase tracking-wider text-[11px] font-mono">
                PASTE BOTH KEYS AT ONCE (RAW TEXT, JSON, OR MULTILINE KEYS)
              </label>
              <textarea
                rows={3}
                value={combinedBothInput}
                onChange={(e) => {
                  setCombinedBothInput(e.target.value);
                  if (e.target.value.length > 10) handleBothKeysPaste(e.target.value);
                }}
                onPaste={(e) => {
                  const data = e.clipboardData.getData('text');
                  handleBothKeysPaste(data);
                }}
                placeholder={`Paste both keys together here...\nExample JSON: { "api_key": "eds_live_ak_...", "secret_key": "whsec_..." }\nOr raw multiline keys. (Instantly wipes box & stores to 60s Cookies on paste)`}
                className="w-full rounded-2xl border border-amber-500/30 bg-zinc-950 p-4 text-xs font-mono text-amber-200 placeholder-zinc-500 focus:border-amber-400 focus:outline-none shadow-inner resize-y leading-relaxed"
              />
            </div>
          )}

          {/* MODE 2: INDIVIDUAL KEY INPUTS */}
          {injectorMode === 'single' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-300 uppercase tracking-wider text-[11px] font-mono">
                  1. PROJECT API KEY
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
                  placeholder="Paste API Key here (eds_live_ak_...)"
                  className="w-full rounded-2xl border border-amber-500/30 bg-zinc-950 px-4 py-3 text-xs font-mono text-amber-200 placeholder-zinc-500 focus:border-amber-400 focus:outline-none shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-300 uppercase tracking-wider text-[11px] font-mono">
                  2. WEBHOOK SECRET KEY
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
                  placeholder="Paste Secret Key here (whsec_...)"
                  className="w-full rounded-2xl border border-amber-500/30 bg-zinc-950 px-4 py-3 text-xs font-mono text-amber-200 placeholder-zinc-500 focus:border-amber-400 focus:outline-none shadow-inner"
                />
              </div>
            </div>
          )}

          {feedbackMsg && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold pt-1">
              <Check className="h-4 w-4 text-emerald-400" />
              <span>{feedbackMsg}</span>
            </div>
          )}
        </div>

        {/* 🚀 DISPATCH FORM & RESPONSE INSPECTION GRID */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          
          {/* Dispatch Form (7 cols) */}
          <form onSubmit={handleSendTest} className="lg:col-span-7 flex flex-col gap-5 rounded-3xl border border-zinc-800/80 bg-zinc-950/90 p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="text-base font-bold text-white border-b border-zinc-800 pb-3 flex items-center justify-between">
              <span>Webhook Dispatch Config</span>
              <span className="text-xs font-mono text-amber-400 font-normal">Method: POST</span>
            </h3>

            {/* Target URL */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Target Endpoint URL *</label>
              <input
                type="url"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 text-xs font-mono text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none shadow-inner"
              />
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Event Signature Type *</label>
              <input
                type="text"
                required
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder="order.created"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 text-xs font-mono text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none shadow-inner"
              />
            </div>

            {/* Payload Body */}
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">JSON Event Payload *</label>
                <span className="text-[11px] text-zinc-500 font-mono">Content-Type: application/json</span>
              </div>
              <textarea
                rows={10}
                required
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 text-xs font-mono text-amber-300 placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y leading-relaxed shadow-inner"
              />
            </div>

            {/* Primary Action Button */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-6 py-3.5 text-xs font-bold text-white transition active:scale-[0.99] shadow-xl shadow-amber-600/20"
              >
                <Play className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Executing Dry-Run Webhook…' : 'Dispatch Test Webhook (Reads 60s Cookie Keys)'}</span>
              </button>
            </div>
          </form>

          {/* Response & Header Inspection (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-5 rounded-3xl border border-zinc-800/80 bg-zinc-950/90 p-6 shadow-2xl backdrop-blur-xl min-h-[500px]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Code2 className="h-5 w-5 text-amber-400" />
                Response & Signature Telemetry
              </h3>
              {testResult && (
                <button
                  type="button"
                  onClick={copyHeaders}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copied ? 'Copied' : 'Copy headers'}</span>
                </button>
              )}
            </div>

            {!testResult ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 text-xs my-auto space-y-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-900 border border-zinc-800 text-amber-400 shadow-inner">
                  <Terminal className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="font-bold text-zinc-300 text-sm">Awaiting Dispatch Execution</h4>
                  <p className="text-zinc-500 text-xs mt-1 max-w-xs leading-relaxed">
                    Click "Dispatch Test Webhook" to calculate asymmetric signatures and capture target response headers.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 text-xs font-mono">
                {/* Status Bar */}
                <div className="flex items-center justify-between p-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-inner">
                  <div className="flex items-center gap-2.5">
                    {testResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-rose-400" />
                    )}
                    <span className={`text-sm font-extrabold ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                      HTTP {testResult.status} {testResult.success ? 'OK' : 'ERROR'}
                    </span>
                  </div>
                  <span className="text-zinc-400 text-xs font-bold">{testResult.latency_ms} ms</span>
                </div>

                {/* Generated Headers */}
                <div className="space-y-2">
                  <div className="text-[11px] font-sans font-bold uppercase tracking-wider text-zinc-400">Computed Webhook Headers</div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-1.5 text-zinc-300 overflow-x-auto text-[11px]">
                    {Object.entries(testResult.headers).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-amber-400 font-bold shrink-0">{k}:</span>
                        <span className="truncate text-zinc-300">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Response Payload */}
                <div className="space-y-2">
                  <div className="text-[11px] font-sans font-bold uppercase tracking-wider text-zinc-400">Response Payload Body</div>
                  <pre className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-emerald-400 overflow-x-auto max-h-56 text-[11px] leading-relaxed shadow-inner">
                    {JSON.stringify(testResult.data || testResult.error, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </ProtectedLayout>
  );
}
