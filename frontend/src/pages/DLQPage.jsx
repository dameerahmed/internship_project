import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, 
  RefreshCw, 
  Play, 
  Trash2, 
  CheckSquare, 
  Square, 
  Copy, 
  Code2, 
  Search,
  CheckCircle2,
  Clock,
  X,
  ChevronRight,
  FileText,
  Download
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { WS_ENDPOINTS, withToken } from '@/utils/constants';
import { useAuth } from '../context/AuthContext';

export default function DLQPage({ projectId, embedded = false }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer state: ONLY open when a DLQ item is explicitly clicked by user!
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('details');

  const fetchDLQ = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = projectId
        ? `/v1/dlq?project_id=${projectId}&limit=100`
        : '/v1/dlq?limit=100';
      const { data } = await apiClient.get(endpoint);
      const list = Array.isArray(data) ? data : [];
      setItems(list);
    } catch (err) {
      console.warn('Failed to fetch DLQ items:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDLQ(false);

    let socket = null;
    let reconnectTimer = null;
    let retryCount = 0;

    const connectWs = () => {
      const token = user?.access_token || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))?.access_token : null);
      if (!token) return;

      const wsUrl = withToken(WS_ENDPOINTS.DLQ(), token);
      try {
        socket = new WebSocket(wsUrl);
        socket.onopen = () => { retryCount = 0; };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'DLQ_UPDATE' || payload?.type === 'DLQ_CHANGE') {
              let nextItems = Array.isArray(payload.items) ? payload.items : [];
              if (projectId) {
                nextItems = nextItems.filter((item) => {
                  const id = item.project_id || item.projectId;
                  return id && Number(id) === Number(projectId);
                });
              }
              setItems(nextItems);
              setSelectedIds((prev) => prev.filter((id) => nextItems.some((item) => (item.id || item.event_id) === id)));
            }
          } catch (err) {
            console.warn('DLQ WS parse error:', err);
          }
        };
        socket.onclose = () => {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount += 1;
          reconnectTimer = setTimeout(connectWs, delay);
        };
        socket.onerror = () => {
          try { socket.close(); } catch {}
        };
      } catch (err) {
        console.warn('DLQ WS error:', err);
      }
    };

    connectWs();

    const interval = setInterval(() => {
      fetchDLQ(true);
    }, 15000);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
      clearInterval(interval);
    };
  }, [projectId, user]);

  const activeItems = items;

  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const eventType = (item.event_type || item.delivery_packet?.event_type || '').toLowerCase();
      const reason = (item.failure_reason || item.error || '').toLowerCase();
      const target = (item.target_url || item.delivery_packet?.target_url || '').toLowerCase();
      return eventType.includes(q) || reason.includes(q) || target.includes(q);
    });
  }, [activeItems, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((i) => i.event_id || i.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleReplay = async (eventIds) => {
    if (!eventIds || eventIds.length === 0) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const endpoint = '/v1/dlq/replay';
      await apiClient.post(endpoint, { log_ids: eventIds, ids: eventIds });
      setMessage({ type: 'success', text: `Requeued ${eventIds.length} failed event(s) for redelivery.` });
      setItems((prev) => prev.filter((item) => !eventIds.includes(item.id || item.event_id)));
      setSelectedIds([]);
      await fetchDLQ(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Replay operation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscard = async (eventIds) => {
    if (!eventIds || eventIds.length === 0) return;
    if (!window.confirm(`Discard ${eventIds.length} selected DLQ item(s)?`)) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const endpoint = '/v1/dlq/discard';
      await apiClient.post(endpoint, { log_ids: eventIds, ids: eventIds });
      setMessage({ type: 'success', text: `Discarded ${eventIds.length} DLQ item(s).` });
      setItems((prev) => prev.filter((item) => !eventIds.includes(item.id || item.event_id)));
      setSelectedIds([]);
      setSelectedItem(null);
      await fetchDLQ(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Discard operation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const copyPayload = (payload) => {
    if (!payload) return;
    navigator.clipboard.writeText(
      typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDLQ = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredItems, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `dlq_events_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const currentSelection = selectedItem || {};

  const content = (
    <div className="flex flex-col h-full w-full font-sans text-zinc-800 dark:text-zinc-200 select-none pb-8">
      
      {/* Top Header & Replay Controls Bar */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
        {!embedded && (
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Dead Letter Queue (DLQ)
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {filteredItems.length} Failed Events Pending Replay
            </span>
          </div>
        )}

        {/* Feedback toast */}
        {message && (
          <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border ${
            message.type === 'error' ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
          }`}>
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} className="hover:opacity-75">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by event type, reason, or URL..."
              className="w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-rose-500 focus:outline-none transition"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              {selectedIds.length === filteredItems.length && filteredItems.length > 0 ? (
                <CheckSquare className="h-3.5 w-3.5 text-rose-500" />
              ) : (
                <Square className="h-3.5 w-3.5 text-zinc-400" />
              )}
              <span>Select All</span>
            </button>

            <button
              type="button"
              disabled={selectedIds.length === 0 || actionLoading}
              onClick={() => handleReplay(selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 font-bold shadow-sm transition disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Replay Selected ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              disabled={selectedIds.length === 0 || actionLoading}
              onClick={() => handleDiscard(selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              <span>Discard Selected</span>
            </button>

            <button
              type="button"
              onClick={() => fetchDLQ(false)}
              className="p-2 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
              title="Refresh DLQ"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-rose-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleExportDLQ}
              className="p-2 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
              title="Export DLQ JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DYNAMIC LAYOUT: Full Width (12 cols) by default; Split (7 + 5 cols) ONLY when a DLQ item is clicked! */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        
        {/* Left DLQ Items Table */}
        <div className={`${selectedItem ? 'lg:col-span-7' : 'lg:col-span-12'} flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-[#0c0e17] shadow-sm transition-all duration-200`}>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs font-mono max-h-[580px] overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                No dead-letter queue records found. All webhooks delivering cleanly!
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const eventId = item.id || item.event_id || `evt_${idx}`;
                const eventType = item.event_type || item.delivery_packet?.event_type || 'webhook.failed';
                const reason = item.failure_reason || item.error || 'Connection Timeout (504 Gateway)';
                const target = item.target_url || item.delivery_packet?.target_url || 'https://api.domain.com/webhook';
                const attempts = item.attempts_count || item.retry_count || 5;
                const isSelected = selectedItem?.id === item.id || selectedItem?.event_id === eventId;
                const isChecked = selectedIds.includes(eventId);

                return (
                  <div
                    key={eventId}
                    onClick={() => setSelectedItem(item)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-white font-semibold border-l-4 border-rose-500 shadow-sm'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 truncate">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(eventId);
                        }}
                        className="text-zinc-400 hover:text-rose-500 transition"
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-rose-500" />
                        ) : (
                          <Square className="h-4 w-4 text-zinc-400" />
                        )}
                      </button>

                      {/* Status Badge */}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                        500 ERROR
                      </span>

                      {/* Event Type */}
                      <span className="text-[11px] font-bold text-zinc-900 dark:text-white shrink-0 w-32 truncate">
                        {eventType}
                      </span>

                      {/* Target & Error Reason */}
                      <div className="flex flex-col truncate">
                        <span className="text-[11px] text-zinc-800 dark:text-zinc-200 truncate font-mono">
                          {target}
                        </span>
                        <span className="text-[10px] text-rose-500 font-sans truncate">
                          {reason}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded font-sans">
                        {attempts} retries
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplay([eventId]);
                        }}
                        className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition"
                        title="Replay Event Now"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiscard([eventId]);
                        }}
                        className="p-1.5 rounded-lg border border-zinc-200 bg-white/80 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 transition"
                        title="Discard Event"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform ${isSelected ? 'rotate-90 text-rose-500' : ''}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Details Inspector Drawer ONLY SHOWN WHEN A DLQ ITEM IS CLICKED! */}
        {selectedItem && (
          <div className="lg:col-span-5 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-[#0c0e17] shadow-lg font-sans flex flex-col gap-4 sticky top-4">
            
            {/* Drawer Top Header with Close 'X' Button */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInspectorTab('details')}
                  className={`pb-1 transition border-b-2 ${
                    inspectorTab === 'details'
                      ? 'border-rose-500 text-zinc-900 dark:text-white font-bold'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('raw')}
                  className={`pb-1 transition border-b-2 ${
                    inspectorTab === 'raw'
                      ? 'border-rose-500 text-zinc-900 dark:text-white font-bold'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  Raw JSON
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => copyPayload(inspectorTab === 'raw' ? currentSelection : (currentSelection.payload || currentSelection))}
                  className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-rose-500 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>

                {/* Close Drawer Button 'X' */}
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="p-1 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition"
                  title="Close Inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Inspector Content */}
            {inspectorTab === 'details' ? (
              <div className="space-y-4 text-xs font-sans">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Event ID</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200 font-bold">
                    {currentSelection.event_id || currentSelection.id || 'evt_9918'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Event Type</span>
                  <span className="font-mono font-bold text-rose-500">
                    {currentSelection.event_type || currentSelection.delivery_packet?.event_type || 'order.created'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Failure Reason</span>
                  <span className="font-sans text-rose-500 font-semibold truncate max-w-[200px]">
                    {currentSelection.failure_reason || currentSelection.error || 'Connection Timeout (504)'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Retry Attempts</span>
                  <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                    {currentSelection.attempts_count || 5} attempts
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    FAILED PAYLOAD METADATA
                  </span>
                  <pre className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-rose-500 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed shadow-inner">
                    {JSON.stringify(currentSelection.payload || currentSelection.delivery_packet?.payload || { error: "Target host unreachable" }, null, 2)}
                  </pre>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleReplay([currentSelection.event_id || currentSelection.id])}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 text-xs shadow-md transition active:scale-95"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Replay This Failed Event Now</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                  <span>FULL RAW DLQ OBJECT</span>
                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500">JSON</span>
                </div>
                <pre className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 font-mono text-[11px] overflow-x-auto max-h-[480px] leading-relaxed shadow-inner">
                  {JSON.stringify(currentSelection, null, 2)}
                </pre>
              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );

  if (embedded) return content;

  return (
    <ProtectedLayout>
      {content}
    </ProtectedLayout>
  );
}
