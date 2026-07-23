import { useEffect, useRef, useState } from 'react';
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
  Activity,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';
import { WS_ENDPOINTS } from '@/utils/constants';

export default function DLQPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('payload');
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [expandedPayloadId, setExpandedPayloadId] = useState(null);

  const wsRef = useRef(null);

  // Load DLQ Items via REST
  const loadDlqItems = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await apiClient.get('/v1/dlq');
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setActiveItem((prev) => (prev ? list.find(i => i.id === prev.id) || list[0] || null : list[0] || null));
    } catch {
      setItems([]);
      setActiveItem(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // WebSocket Live Real-Time Stream Setup
  useEffect(() => {
    loadDlqItems();

    const companyId = user?.company_id || '';
    if (!companyId) return;

    const wsUrl = WS_ENDPOINTS.DLQ(companyId);
    let ws = null;
    let timer = null;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Clear polling fallback — WS is handling live updates
        if (timer) clearInterval(timer);
      };

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.type === 'DLQ_UPDATE' && Array.isArray(payload.items)) {
            setItems(payload.items);
            setLoading(false);
            setActiveItem((prev) => (
              prev ? payload.items.find(i => i.id === prev.id) || payload.items[0] || null
                   : payload.items[0] || null
            ));
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Resume polling fallback when WS drops
        timer = setInterval(() => loadDlqItems(true), 2500);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
      // Pure polling fallback when WS cannot be established
      timer = setInterval(() => loadDlqItems(true), 2500);
    }

    return () => {
      if (ws) ws.close();
      if (timer) clearInterval(timer);
    };
  }, [user?.company_id]);

  // Replay (Push real message back into main RabbitMQ queue & purge from DLQ)
  const handleReplay = async (targetIds) => {
    if (!targetIds || targetIds.length === 0) return;
    setActionLoading(true);

    // Optimistic UI removal for zero latency
    const targetSet = new Set(targetIds.map(String));
    setItems((prev) => prev.filter((i) => !targetSet.has(String(i.id)) && !targetSet.has(String(i.raw_id))));
    if (activeItem && (targetSet.has(String(activeItem.id)) || targetSet.has(String(activeItem.raw_id)))) {
      setActiveItem(null);
    }

    try {
      const { data } = await apiClient.post('/v1/dlq/replay', { log_ids: targetIds });
      const count = data.replayed_count || targetIds.length;
      setActionMessage({
        type: 'success',
        text: `✓ Successfully pushed ${count} message(s) back into RabbitMQ main queue (webhook_delivery_queue)!`
      });
      setSelectedIds([]);
      await loadDlqItems(true);
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to re-queue message back to RabbitMQ.' });
      await loadDlqItems(true);
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(null), 4500);
    }
  };

  // Discard failed items permanently from RabbitMQ DLQ
  const handleDiscard = async (targetIds) => {
    if (!targetIds || targetIds.length === 0) return;
    if (!window.confirm(`Discard ${targetIds.length} message(s) permanently from RabbitMQ DLQ?`)) return;

    setActionLoading(true);
    const targetSet = new Set(targetIds.map(String));
    setItems((prev) => prev.filter((i) => !targetSet.has(String(i.id)) && !targetSet.has(String(i.raw_id))));

    try {
      await apiClient.post('/v1/dlq/discard', { log_ids: targetIds });
      setActionMessage({ type: 'success', text: `✓ Discarded ${targetIds.length} message(s) from RabbitMQ DLQ.` });
      setSelectedIds([]);
      await loadDlqItems(true);
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to discard items from DLQ.' });
      await loadDlqItems(true);
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(null), 4500);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i) => i.id));
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
    <ProtectedLayout title="Live DLQ Engine Workspace" eyebrow="RabbitMQ Live AMQP Failure Isolation">
      <div className="space-y-5">
        
        {/* HEADER WORKSPACE BANNER */}
        <div className="overflow-hidden rounded-2xl border border-rose-500/30 bg-[#090b12] p-5 shadow-[0_0_35px_-10px_rgba(244,63,94,0.15)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-rose-400">
                  REAL-TIME RABBITMQ DLQ DASHBOARD
                </span>
                
                {/* LIVE CONNECTION STATUS BADGE */}
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ml-2 ${
                  wsConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
                }`}>
                  <Activity size={10} className={wsConnected ? 'animate-spin text-emerald-400' : ''} />
                  <span>{wsConnected ? 'LIVE WEBSOCKET STREAM ACTIVE' : 'LIVE POLLING (2.5s)'}</span>
                </div>
              </div>

              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                <span>Dead Letter Queue</span>
                <span className="text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded-full">
                  {items.length} Failed Message{items.length !== 1 ? 's' : ''}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadDlqItems(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-750 bg-[#121420] hover:bg-zinc-800 px-3.5 py-2 text-xs font-mono font-bold text-zinc-200 transition active:scale-95 shadow-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                REFRESH QUEUE
              </button>

              {items.length > 0 && (
                <button
                  onClick={() => handleReplay(items.map((i) => i.id))}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-mono font-bold text-zinc-950 transition active:scale-95 shadow-md disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" />
                  RETRY ALL ({items.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* FEEDBACK TOAST MESSAGE */}
        {actionMessage && (
          <div className={`p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between shadow-md ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <span className="font-bold">{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="text-zinc-400 hover:text-white">✕</button>
          </div>
        )}

        {/* BULK SELECTION ACTION BAR */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 font-mono text-xs shadow-md">
            <span className="font-bold text-cyan-300">{selectedIds.length} DLQ message(s) selected</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleReplay(selectedIds)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 font-bold text-zinc-950 hover:bg-emerald-400 transition active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                PUSH TO MAIN QUEUE ({selectedIds.length})
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

        {/* COMPACT & MODERN REAL-TIME DLQ TABLE VIEW */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.58fr_0.42fr] h-[calc(100vh-19rem)] min-h-[500px]">
          
          {/* LEFT PANEL: LIVE DLQ MESSAGES TABLE */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#08090e] shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-[#0c0e18]">
              <label className="flex items-center gap-2 font-mono text-xs font-bold text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length && items.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                />
                SELECT ALL ({items.length})
              </label>
              <span className="font-mono text-[11px] text-zinc-400 flex items-center gap-1">
                <Server size={12} className="text-cyan-400" /> Queue: <code className="text-cyan-300">webhook_dead_letter_queue</code>
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
              {loading ? (
                <div className="py-20 text-center font-mono text-xs text-zinc-500 flex flex-col items-center justify-center">
                  <RefreshCw className="h-6 w-6 text-rose-400 animate-spin mb-3" />
                  Connecting to live RabbitMQ Dead Letter Queue...
                </div>
              ) : items.length === 0 ? (
                <div className="py-20 text-center font-mono text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-8">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3 opacity-70" />
                  <p className="font-bold text-zinc-200 text-sm">RabbitMQ Dead Letter Queue is Empty!</p>
                  <p className="mt-1 text-zinc-400 max-w-xs mx-auto">Zero undeliverable messages currently in RabbitMQ <code className="text-emerald-400">webhook_dead_letter_queue</code>.</p>
                </div>
              ) : (
                items.map((item) => {
                  const isSelected = activeItem?.id === item.id;
                  const isChecked = selectedIds.includes(item.id);
                  const isExpanded = expandedPayloadId === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveItem(item)}
                      className={`w-full rounded-xl border p-3.5 text-left transition cursor-pointer ${
                        isSelected
                          ? 'border-rose-500/50 bg-rose-500/10 shadow-sm'
                          : 'border-zinc-800 bg-[#0c0e18] hover:border-zinc-700 hover:bg-[#111422]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelect(item.id);
                            }}
                            className="mt-1 rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-rose-500"
                          />

                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 text-[10px]">
                                DLQ FAIL
                              </span>
                              <span className="font-bold text-zinc-100">{item.project_name}</span>
                              <span className="font-mono text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">
                                {item.event_type}
                              </span>
                              <span className="font-mono text-[10px] text-zinc-500 ml-auto">
                                {item.created_at ? new Date(item.created_at).toLocaleTimeString() : ''}
                              </span>
                            </div>

                            {/* Failure Exception */}
                            <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-2 font-mono text-xs font-semibold text-rose-300 truncate">
                              Exception: {item.error_message}
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-0.5">
                              <span className="truncate max-w-[200px] text-zinc-400">{item.target_url}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-amber-400">Attempts: {item.attempt_number}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedPayloadId(isExpanded ? null : item.id);
                                  }}
                                  className="text-cyan-400 hover:underline flex items-center gap-0.5"
                                >
                                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  <span>Payload</span>
                                </button>
                              </div>
                            </div>

                            {/* Collapsible Inline Payload Preview */}
                            {isExpanded && (
                              <div className="mt-2 rounded-lg border border-zinc-800 bg-[#040508] p-2.5 font-mono text-[11px] text-emerald-300 max-h-32 overflow-y-auto">
                                <pre>{JSON.stringify(item.payload || {}, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* RE-QUEUE BUTTON WITH ACTIVE SPINNER STATE */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReplay([item.id]);
                          }}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-mono font-bold text-zinc-950 transition shrink-0 active:scale-95 disabled:opacity-50"
                          title="Push message back into main RabbitMQ worker queue"
                        >
                          <RefreshCw className={`h-3 w-3 ${actionLoading ? 'animate-spin' : ''}`} />
                          <span>RETRY</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT PANEL: RAW PAYLOAD & HEADER INSPECTOR */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#07080d] p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-amber-400" />
                <div>
                  <h4 className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">PAYLOAD & AMQP HEADERS</h4>
                  <p className="text-[10px] font-mono text-zinc-500">Live JSON body & dead-letter headers</p>
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
                Select a failed message on the left to inspect raw payload JSON and headers.
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                
                {/* Exception Summary Box */}
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs space-y-1">
                  <p className="font-bold text-rose-300">Failure Exception: {activeItem.error_message}</p>
                  <p className="text-zinc-400 text-[11px]">
                    Source Queue: <code className="text-cyan-300">{activeItem.source_queue}</code> | Routing Key: <code className="text-purple-300">{activeItem.routing_key}</code>
                  </p>
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

                {/* JSON Display Box */}
                <div className="mt-3 flex-1 overflow-auto rounded-xl border border-zinc-800 bg-[#040508] p-4 scrollbar-thin">
                  <pre className="font-mono text-xs text-emerald-300 leading-relaxed select-all">
                    {JSON.stringify(
                      activeTab === 'payload' ? activeItem.payload || {} : activeItem.headers || {},
                      null,
                      2
                    )}
                  </pre>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[200px]">ID: {activeItem.id}</span>
                  <button
                    onClick={() => handleReplay([activeItem.id])}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition active:scale-95"
                  >
                    <RefreshCw className={`h-4 w-4 ${actionLoading ? 'animate-spin' : ''}`} />
                    <span>PUSH TO MAIN QUEUE</span>
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
