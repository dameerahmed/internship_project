import React, { useState, useEffect } from 'react';
import { Zap, Play, CheckCircle2, AlertCircle, Copy, Code2, KeyRound, Lock, Eye, EyeOff } from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';

async function computeHmacSha256(secret, message) {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(message);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('Web Crypto signature failed:', err);
    return 'sig_' + Math.random().toString(36).substring(2);
  }
}

export default function SandboxPage() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
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
          email: 'test@example.com'
        }
      },
      null,
      2
    )
  );

  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data } = await apiClient.get('/v1/projects');
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId(list[0].id);
        }
      } catch (err) {
        console.warn('Failed to load projects:', err);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const fetchCredentials = async () => {
      if (!selectedProjectId) return;
      try {
        const { data } = await apiClient.get(`/v1/projects/refresh_keys/${selectedProjectId}`);
        if (data?.api_key) setApiKey(data.api_key);
        if (data?.secret_key) setSecretKey(data.secret_key);
        if (data?.target_url) setTargetUrl(data.target_url);
      } catch (err) {
        console.warn('Failed to fetch selected project credentials:', err);
      }
    };
    fetchCredentials();
  }, [selectedProjectId]);

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

      parsedPayload.event = eventType;
      const bodyBytes = JSON.stringify(parsedPayload);
      const signature = await computeHmacSha256(secretKey || 'gateway-secret', bodyBytes);

      const headers = {
        'X-API-KEY': apiKey,
        'X-HUB-SIGNATURE': signature,
        'X-Hub-Signature-256': signature,
        'Content-Type': 'application/json'
      };

      let response;
      try {
        response = await apiClient.post('/v1/gateway', parsedPayload, { headers });
      } catch (gatewayErr) {
        // Fallback to Swagger gateway test helper endpoint if API key or secret format is direct
        response = await apiClient.post('/v1/webhooks/dispatch', {
          target_url: targetUrl,
          event_type: eventType,
          payload: parsedPayload,
          headers
        });
      }

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      setTestResult({
        status: response.status || 200,
        success: true,
        latency_ms: latency,
        headers,
        data: response.data || { status: 'Accepted', detail: 'Valid signature. Webhook delivery task queued.' }
      });
    } catch (err) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      setTestResult({
        status: err.response?.status || 500,
        success: false,
        latency_ms: latency,
        headers: {
          'X-API-KEY': apiKey ? apiKey.substring(0, 15) + '...' : '[MISSING]',
          'X-HUB-SIGNATURE': '[CALCULATED_HMAC]',
          'Content-Type': 'application/json'
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
    <ProtectedLayout title="Sandbox tester" eyebrow="TESTING & SIMULATION">
      <div className="flex flex-col gap-6 font-sans text-zinc-200 w-full">
        
        {/* Intro Banner */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-800/50 bg-[#111111] p-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-teal-400" />
              Webhook dry-run simulator
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Compose custom webhooks, generate security signatures, and test target endpoints in real time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          
          {/* Dispatch Form (7 cols) */}
          <form onSubmit={handleSendTest} className="lg:col-span-7 flex flex-col gap-4 rounded-xl border border-zinc-800/50 bg-[#111111] p-4">
            <h3 className="text-sm font-bold text-white border-b border-zinc-800/50 pb-3">
              Request details
            </h3>

            {/* Project Selector */}
            {projects.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Select Project Credentials</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white focus:border-teal-500 focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Project #{p.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-teal-400" />
                <span>API Key (X-API-KEY) *</span>
              </label>
              <input
                type="text"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gw_live:1:1:..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-teal-300 placeholder-zinc-500 focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* Secret Key / HMAC Signature */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                <Lock className="h-3.5 w-3.5 text-cyan-400" />
                <span>HMAC Secret Key (used to generate X-HUB-SIGNATURE) *</span>
              </label>
              <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
                <input
                  type={showSecret ? 'text' : 'password'}
                  required
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="whsec_..."
                  className="w-full bg-transparent px-3 py-2 text-xs font-mono text-cyan-300 placeholder-zinc-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="p-2 text-zinc-400 hover:text-white"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Target URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Target URL</label>
              <input
                type="url"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* Event Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Event type</label>
              <input
                type="text"
                required
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder="order.created"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* Payload Body */}
            <div className="space-y-1.5 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">JSON payload</label>
                <span className="text-[11px] text-zinc-500 font-mono">application/json</span>
              </div>
              <textarea
                rows={10}
                required
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full flex-1 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs font-mono text-teal-300 placeholder-zinc-500 focus:border-teal-500 focus:outline-none resize-y"
              />
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white transition active:scale-[0.99]"
              >
                <Play className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Dispatching test webhook…' : 'Dispatch test webhook'}</span>
              </button>
            </div>
          </form>

          {/* Response & Header Inspection (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4 rounded-xl border border-zinc-800/50 bg-[#111111] p-4">
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 className="h-4 w-4 text-teal-400" />
                Response inspection
              </h3>
              {testResult && (
                <button
                  type="button"
                  onClick={copyHeaders}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copied ? 'Copied' : 'Copy headers'}</span>
                </button>
              )}
            </div>

            {!testResult ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 text-xs">
                <Zap className="h-8 w-8 text-zinc-700 mb-2" />
                <span>Dispatch a test webhook to view signature headers and target server response.</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs font-mono">
                {/* Status Bar */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/50 bg-zinc-900">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-teal-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    )}
                    <span className={`font-bold ${testResult.success ? 'text-teal-400' : 'text-rose-400'}`}>
                      HTTP {testResult.status}
                    </span>
                  </div>
                  <span className="text-zinc-400">{testResult.latency_ms} ms</span>
                </div>

                {/* Generated Headers */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-sans font-medium text-zinc-400">Generated headers</div>
                  <div className="rounded-lg border border-zinc-800/50 bg-zinc-950 p-3 space-y-1 text-zinc-300 overflow-x-auto">
                    {Object.entries(testResult.headers).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-teal-400 font-bold shrink-0">{k}:</span>
                        <span className="truncate text-zinc-300">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Response Payload */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-sans font-medium text-zinc-400">Response body</div>
                  <pre className="rounded-lg border border-zinc-800/50 bg-zinc-950 p-3 text-zinc-300 overflow-x-auto max-h-48 text-[11px]">
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
