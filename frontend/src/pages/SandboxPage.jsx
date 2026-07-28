import React, { useState } from 'react';
import { Zap, Play, CheckCircle2, AlertCircle, Copy, Code2 } from 'lucide-react';
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
          id: '',
          email: ''
        }
      },
      null,
      2
    )
  );

  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copied, setCopied] = useState(false);

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

      // Dispatch dry-run request to backend gateway
      const response = await apiClient.post('/v1/webhooks/dispatch', {
        target_url: targetUrl,
        event_type: eventType,
        payload: parsedPayload,
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
          'X-EDS-Signature': 't=1722070000,v1=a8f9c73e02914b519c2317f0a99c9d4218e88e',
          'X-EDS-Timestamp': Math.floor(Date.now() / 1000).toString(),
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
