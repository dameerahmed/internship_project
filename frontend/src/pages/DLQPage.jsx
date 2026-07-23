import { useEffect, useState } from 'react';
import { 
  AlertTriangle, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  Code2, 
  Copy, 
  Check, 
  ShieldCheck, 
  Zap,
  Server,
  Cpu
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';

export default function DLQPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('payload');
  const [copied, setCopied] = useState(false);

  // Fetch Real Failed Messages directly from RabbitMQ DLQ
  const loadDlqItems = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/v1/dlq');
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setActiveItem(list[0] || null);
    } catch {
      setItems([]);
      setActiveItem(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDlqItems();
  }, []);

  // Requeue real message from RabbitMQ DLQ back to main RabbitMQ exchange/queue
  const handleReplay = async (targetIds) => {
    if (!targetIds || targetIds.length === 0) return;
    setActionLoading(true);
    try {
      const { data } = await apiClient.post('/v1/dlq/replay', { log_ids: targetIds });
      setActionMessage({ 
        type: 'success', 
        text: `✓ Re-queued ${data.replayed_count || targetIds.length} message(s) from RabbitMQ DLQ back into main execution queue (webhook_delivery_queue)!` 
      });
      setSelectedIds([]);
      await loadDlqItems();
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to re-queue messages into RabbitMQ main queue. Please check RabbitMQ connectivity.' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(null), 4500);
    }
  };

  // Discard / Purge real failed messages from RabbitMQ DLQ
  const handleDiscard = async (targetIds) => {
    if (!targetIds || targetIds.length === 0) return;
    if (!window.confirm(`Permanently discard ${targetIds.length} message(s) directly from RabbitMQ DLQ?`)) return;
    
    setActionLoading(true);
    try {
      await apiClient.post('/v1/dlq/discard', { log_ids: targetIds });
      setActionMessage({ type: 'success', text: `✓ Discarded ${targetIds.length} message(s) permanently from RabbitMQ Dead Letter Queue.` });
      setSelectedIds([]);
      await loadDlqItems();
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to discard items from RabbitMQ DLQ.' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(null), 4500);
    }
  };

  // Toggle selection
  const toggleSelect = (id) => {
    setSelectedIds((prev) => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(i => i.id));
    }
  };

  const copyJson = () => {
    if (!activeItem) return;
    const content = activeTab === 'payload' ? activeItem.payload : activeItem.headers;
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ProtectedLayout title="Dead Letter Queue Workspace" eyebrow="RabbitMQ DLQ Failure Recovery">
      <div className="space-y-6">
        
        {/* WORKSPACE HEADER BANNER */}
        <div className="overflow-hidden rounded-3xl border border-rose-500/30 bg-[#090b12] p-6 shadow-[0_0_35px_-10px_rgba(244,63,94,0.15)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-rose-400">RABBITMQ DLQ ENGINE (LIVE AMQP BOUND)</p>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                <span>Dead Letter Queue Workspace</span>
                <span className="text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded-full">
                  {items.length} Active DLQ Message{items.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <p className="mt-1 font-mono text-xs text-zinc-400 max-w-3xl">
                Direct integration with RabbitMQ Dead Letter Queue (<code className="text-cyan-300">webhook_dead_letter_queue</code>). Inspect original failed payloads, verify dead-letter headers, and push jobs back into <code className="text-emerald-300">webhook_delivery_queue</code> for execution.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={loadDlqItems}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-750 bg-[#121420] hover:bg-zinc-800 px-3.5 py-2 text-xs font-mono font-bold text-zinc-200 transition active:scale-95 shadow-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                REFRESH RABBITMQ
              </button>

              {items.length > 0 && (
                <button
                  onClick={() => handleReplay(items.map(i => i.id))}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 text-xs font-mono font-bold text-emerald-400 transition active:scale-95 shadow-md disabled:opacity-50"
                >
                  <Zap className="h-4 w-4 text-emerald-400" />
                  REPLAY ALL ({items.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* FEEDBACK TOAST MESSAGE */}
        {actionMessage && (
          <div className={`p-4 rounded-2xl border font-mono text-xs flex items-center justify-between shadow-lg ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <span className="font-bold">{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="text-zinc-400 hover:text-white">✕</button>
          </div>
        )}

        {/* BULK ACTION BAR */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 font-mono text-xs shadow-lg">
            <span className="font-bold text-cyan-300">{selectedIds.length} RabbitMQ DLQ message(s) selected</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleReplay(selectedIds)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500 px-3.5 py-1.5 font-bold text-black hover:bg-emerald-400 transition active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                REQUEUE TO MAIN QUEUE ({selectedIds.length})
              </button>
              <button
                onClick={() => handleDiscard(selectedIds)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3.5 py-1.5 font-bold text-rose-300 hover:bg-rose-500/30 transition active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />
                DISCARD ({selectedIds.length})
              </button>
            </div>
          </div>
        )}

        {/* DUAL SPLIT DLQ WORKSPACE */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.55fr_0.45fr] h-[calc(100vh-20rem)] min-h-[500px]">
          
          {/* LEFT PANEL: REAL RABBITMQ DLQ MESSAGES */}
          <div className="overflow-y-auto rounded-3xl border border-zinc-800 bg-[#08090e] p-4 scrollbar-thin space-y-2">
            
            <div className="flex items-center justify-between px-2 py-1 mb-2 border-b border-zinc-800/80 pb-2">
              <label className="flex items-center gap-2 font-mono text-xs font-bold text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length && items.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                />
                SELECT ALL ({items.length})
              </label>
              <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                <Server size={11} className="text-cyan-400" /> RabbitMQ Queue: webhook_dead_letter_queue
              </span>
            </div>

            {loading ? (
              <div className="py-20 text-center font-mono text-xs text-zinc-500 flex flex-col items-center justify-center">
                <RefreshCw className="h-6 w-6 text-rose-400 animate-spin mb-3" />
                Fetching real messages from RabbitMQ DLQ...
              </div>
            ) : items.length === 0 ? (
              <div className="py-20 text-center font-mono text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-2xl p-8">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3 opacity-60" />
                <p className="font-bold text-zinc-300 text-sm">RabbitMQ Dead Letter Queue is empty!</p>
                <p className="mt-1 text-zinc-500 max-w-xs mx-auto">No undeliverable messages are currently sitting in RabbitMQ queue <code className="text-emerald-400">webhook_dead_letter_queue</code>.</p>
              </div>
            ) : (
              items.map((item) => {
                const isSelected = activeItem?.id === item.id;
                const isChecked = selectedIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveItem(item)}
                    className={`w-full rounded-2xl border p-4 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-rose-500/50 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.1)]'
                        : 'border-zinc-850 bg-[#0d0f19] hover:border-zinc-750 hover:bg-[#121421]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(item.id);
                          }}
                          className="mt-1 rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-rose-500"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              DLQ MESSAGE
                            </span>
                            <span className="font-mono text-xs font-bold text-zinc-200">{item.project_name}</span>
                            <span className="font-mono text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                              {item.event_type}
                            </span>
                          </div>

                          {/* EXACT FAILURE REASON DISPLAYED */}
                          <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-950/20 p-2 font-mono text-xs font-semibold text-rose-300">
                            Failure Exception: {item.error_message}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[11px] font-mono text-zinc-400">
                            <span className="truncate max-w-[200px] text-zinc-400">Target: {item.target_url}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-amber-400">Queue: {item.source_queue || 'webhook_delivery_queue'}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-500">Retries: {item.attempt_number}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplay([item.id]);
                        }}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-400 transition shrink-0"
                        title="Push message back into main RabbitMQ worker queue for execution"
                      >
                        <RefreshCw className="h-3 w-3" />
                        RETRY
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT PANEL: PAYLOAD & HEADER INSPECTOR */}
          <div className="flex flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-[#07080d] p-5 shadow-xl">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-amber-400" />
                <div>
                  <h4 className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">RABBITMQ MESSAGE PAYLOAD INSPECTOR</h4>
                  <p className="text-[10px] font-mono text-zinc-500">Original message body & AMQP metadata headers</p>
                </div>
              </div>

              {activeItem && (
                <button
                  onClick={copyJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-750 bg-[#121420] px-2.5 py-1 text-xs font-mono font-bold text-zinc-300 hover:bg-zinc-800 transition active:scale-95"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'COPIED!' : 'COPY_JSON'}
                </button>
              )}
            </div>

            {!activeItem ? (
              <div className="flex flex-1 items-center justify-center text-center p-6 font-mono text-xs text-zinc-500">
                Select a failed RabbitMQ message on the left to inspect raw payload JSON and headers.
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                
                {/* Error Summary Header */}
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs">
                  <p className="font-bold text-rose-300">Failure Reason: {activeItem.error_message}</p>
                  <p className="mt-0.5 text-zinc-400 text-[11px]">Source Queue: <span className="text-cyan-300 font-bold">{activeItem.source_queue}</span> | Routing Key: <span className="text-purple-300">{activeItem.routing_key}</span></p>
                </div>

                {/* Tab Switcher */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setActiveTab('payload')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
                      activeTab === 'payload'
                        ? 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                        : 'bg-[#10121d] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    ORIGINAL PAYLOAD
                  </button>

                  <button
                    onClick={() => setActiveTab('headers')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
                      activeTab === 'headers'
                        ? 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                        : 'bg-[#10121d] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    RABBITMQ HEADERS
                  </button>
                </div>

                {/* JSON Display */}
                <div className="mt-3 flex-1 overflow-auto rounded-xl border border-zinc-800 bg-[#040508] p-4 scrollbar-thin">
                  <pre className="font-mono text-xs text-emerald-300 leading-relaxed select-all">
                    {JSON.stringify(
                      activeTab === 'payload' ? activeItem.payload || {} : activeItem.headers || {},
                      null,
                      2
                    )}
                  </pre>
                </div>

                {/* Bottom Replay Action Bar */}
                <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[200px]">Event ID: {activeItem.event_id}</span>
                  <button
                    onClick={() => handleReplay([activeItem.id])}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-black hover:bg-emerald-400 transition active:scale-95"
                  >
                    <RefreshCw className="h-4 w-4" />
                    PUSH TO MAIN QUEUE (RETRY)
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </ProtectedLayout>
  );
}
