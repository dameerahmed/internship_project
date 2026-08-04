import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Play,
  Trash2,
  CheckSquare,
  Square,
  Copy,
  Search,
  X,
  ChevronRight,
  Download,
  ShieldAlert,
  Wifi,
  Clock,
  Zap,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Server,
  Hash
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { WS_ENDPOINTS, withToken } from '@/utils/constants';
import { useAuth } from '../context/AuthContext';

// ─── Severity helpers ──────────────────────────────────────────────────────────
function getAttemptSeverity(attempts) {
  const n = Number(attempts) || 1;
  if (n >= 5) return { label: 'CRITICAL', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)' };
  if (n >= 3) return { label: 'HIGH',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' };
  return              { label: 'MEDIUM',  color: '#6366f1', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)' };
}

function classifyError(errorMsg) {
  const m = (errorMsg || '').toLowerCase();
  if (m.includes('timeout') || m.includes('timed out'))   return { icon: Clock,       label: 'Timeout',         color: '#f59e0b' };
  if (m.includes('connect') || m.includes('network'))     return { icon: Wifi,        label: 'Network',         color: '#6366f1' };
  if (m.includes('500') || m.includes('server'))          return { icon: Server,      label: 'Server Error',    color: '#f43f5e' };
  if (m.includes('404'))                                  return { icon: AlertCircle, label: 'Not Found',       color: '#f59e0b' };
  return                                                   { icon: ShieldAlert,       label: 'Unknown',         color: '#64748b' };
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000)     return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000)   return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)  return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(isoStr).toLocaleDateString();
}

// ─── Animated count badge ─────────────────────────────────────────────────────
function LiveBadge({ count }) {
  const prevRef = useRef(count);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prevRef.current !== count) { setFlash(true); setTimeout(() => setFlash(false), 600); }
    prevRef.current = count;
  }, [count]);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
      style={{
        background: flash ? 'rgba(244,63,94,0.25)' : 'rgba(244,63,94,0.1)',
        color: '#f87171',
        border: '1px solid rgba(244,63,94,0.3)',
        transform: flash ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
      {count} failed
    </span>
  );
}

// ─── Attempt progress bar ─────────────────────────────────────────────────────
function AttemptBar({ attempts }) {
  const n = Math.min(Number(attempts) || 1, 5);
  const sev = getAttemptSeverity(n);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(i => (
          <div
            key={i}
            className="h-1.5 w-3 rounded-sm transition-all"
            style={{ background: i <= n ? sev.color : 'rgba(100,116,139,0.2)' }}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold font-mono" style={{ color: sev.color }}>
        {n}/5
      </span>
    </div>
  );
}

// ─── Row skeleton ─────────────────────────────────────────────────────────────
function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 animate-pulse">
      <div className="h-4 w-4 rounded bg-white/5" />
      <div className="h-3 w-16 rounded bg-white/5" />
      <div className="h-3 w-24 rounded bg-white/5" />
      <div className="h-3 flex-1 rounded bg-white/5" />
      <div className="h-3 w-20 rounded bg-white/5" />
    </div>
  );
}

export default function DLQPage({ projectId, embedded = false }) {
  const { user } = useAuth();
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedIds, setSelectedIds]   = useState([]);
  const [actionLoading, setActionLoading] = useState({});   // per-row loading map
  const [bulkLoading, setBulkLoading]   = useState(false);
  const [message, setMessage]           = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [copied, setCopied]             = useState(false);
  const [inspectorTab, setInspectorTab] = useState('details');
  const [wsConnected, setWsConnected]   = useState(false);
  const [removingIds, setRemovingIds]   = useState(new Set());   // IDs mid-animation

  const fetchDLQ = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = projectId ? `/v1/dlq?project_id=${projectId}&limit=100` : '/v1/dlq?limit=100';
      const { data } = await apiClient.get(endpoint);
      setItems(Array.isArray(data) ? data : []);
    } catch { /* non-fatal */ } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId]);

  // ── WebSocket with reconnect ───────────────────────────────────────────────
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
        socket.onopen  = () => { retryCount = 0; setWsConnected(true); };
        socket.onclose = () => {
          setWsConnected(false);
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount++;
          reconnectTimer = setTimeout(connectWs, delay);
        };
        socket.onerror = () => { try { socket.close(); } catch {} };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'DLQ_UPDATE' || payload?.type === 'DLQ_CHANGE') {
              // Always re-fetch on any DLQ change for accuracy
              fetchDLQ(true);
            }
          } catch { /* ignore parse errors */ }
        };
      } catch { /* ignore */ }
    };

    connectWs();
    const interval = setInterval(() => fetchDLQ(true), 20000);

    return () => {
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
      clearInterval(interval);
    };
  }, [projectId, user, fetchDLQ]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter(item => {
      if (!q) return true;
      const et  = (item.event_type || '').toLowerCase();
      const err = (item.error_message || '').toLowerCase();
      const url = (item.target_url || '').toLowerCase();
      const pid = String(item.project_id || '');
      return et.includes(q) || err.includes(q) || url.includes(q) || pid.includes(q);
    });
  }, [items, searchQuery]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === filteredItems.length && filteredItems.length > 0
      ? []
      : filteredItems.map(i => i.event_id || i.id));
  };
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Instant remove animation then fetch ──────────────────────────────────
  const animateRemove = useCallback((ids) => {
    setRemovingIds(prev => new Set([...prev, ...ids.map(String)]));
    setTimeout(() => {
      setItems(prev => prev.filter(item => {
        const k1 = String(item.id || '');
        const k2 = String(item.event_id || '');
        return !ids.map(String).includes(k1) && !ids.map(String).includes(k2);
      }));
      setRemovingIds(prev => {
        const next = new Set(prev);
        ids.map(String).forEach(id => next.delete(id));
        return next;
      });
      setSelectedIds(prev => prev.filter(id => !ids.map(String).includes(String(id))));
      if (selectedItem && (ids.map(String).includes(String(selectedItem.id)) || ids.map(String).includes(String(selectedItem.event_id)))) {
        setSelectedItem(null);
      }
    }, 300);
    setTimeout(() => fetchDLQ(true), 1500);
  }, [selectedItem, fetchDLQ]);

  // ── Replay ────────────────────────────────────────────────────────────────
  const handleReplay = useCallback(async (eventIds, single = false) => {
    if (!eventIds?.length) return;
    if (single) {
      setActionLoading(prev => ({ ...prev, [eventIds[0]]: 'replay' }));
    } else {
      setBulkLoading(true);
    }
    setMessage(null);
    try {
      await apiClient.post('/v1/dlq/replay', { log_ids: eventIds, ids: eventIds });
      setMessage({ type: 'success', text: `✓ Requeued ${eventIds.length} event(s) for redelivery.` });
      animateRemove(eventIds);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Replay failed — check server logs.' });
    } finally {
      if (single) {
        setActionLoading(prev => { const n = {...prev}; delete n[eventIds[0]]; return n; });
      } else {
        setBulkLoading(false);
      }
    }
  }, [animateRemove]);

  // ── Discard ───────────────────────────────────────────────────────────────
  const handleDiscard = useCallback(async (eventIds, single = false) => {
    if (!eventIds?.length) return;
    if (!window.confirm(`Permanently discard ${eventIds.length} DLQ item(s)? This cannot be undone.`)) return;
    if (single) {
      setActionLoading(prev => ({ ...prev, [eventIds[0]]: 'discard' }));
    } else {
      setBulkLoading(true);
    }
    setMessage(null);
    try {
      await apiClient.post('/v1/dlq/discard', { log_ids: eventIds, ids: eventIds });
      setMessage({ type: 'success', text: `✓ Discarded ${eventIds.length} DLQ item(s).` });
      animateRemove(eventIds);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Discard failed.' });
    } finally {
      if (single) {
        setActionLoading(prev => { const n = {...prev}; delete n[eventIds[0]]; return n; });
      } else {
        setBulkLoading(false);
      }
    }
  }, [animateRemove]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filteredItems, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `dlq_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const copyPayload = (content) => {
    navigator.clipboard.writeText(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const sel = selectedItem || {};

  const content = (
    <div className="flex flex-col h-full w-full select-none pb-8" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pb-4 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {!embedded && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)' }}>
                <AlertTriangle className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight" style={{ color: '#f1f5f9' }}>
                  Dead Letter Queue
                </h1>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                  Failed webhook events awaiting replay or discard
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Live connection badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: wsConnected ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
                  color: wsConnected ? '#10b981' : '#64748b',
                  border: `1px solid ${wsConnected ? 'rgba(16,185,129,0.25)' : 'rgba(100,116,139,0.2)'}`,
                }}>
                <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                {wsConnected ? 'LIVE' : 'OFFLINE'}
              </span>
              <LiveBadge count={filteredItems.length} />
            </div>
          </div>
        )}

        {/* Feedback toast */}
        {message && (
          <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold animate-fadeIn"
            style={{
              background: message.type === 'error' ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
              color: message.type === 'error' ? '#fb7185' : '#34d399',
              border: `1px solid ${message.type === 'error' ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`,
            }}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="hover:opacity-70 transition-opacity">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: '#475569' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search event type, error, URL, project ID..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none transition"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f1f5f9',
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Select All */}
            <button
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
            >
              {selectedIds.length === filteredItems.length && filteredItems.length > 0
                ? <CheckSquare className="h-3.5 w-3.5 text-rose-500" />
                : <Square className="h-3.5 w-3.5" />}
              Select All
            </button>

            {/* Replay Selected */}
            <button
              disabled={selectedIds.length === 0 || bulkLoading}
              onClick={() => handleReplay(selectedIds)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-40"
              style={{ background: '#e11d48', color: '#fff', border: 'none', boxShadow: '0 0 0 1px rgba(244,63,94,0.4)' }}
            >
              {bulkLoading
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5 fill-current" />}
              Replay ({selectedIds.length})
            </button>

            {/* Discard Selected */}
            <button
              disabled={selectedIds.length === 0 || bulkLoading}
              onClick={() => handleDiscard(selectedIds)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition hover:opacity-80 active:scale-95 disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              Discard
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchDLQ(false)}
              className="p-2 rounded-xl transition hover:opacity-70 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
              title="Refresh DLQ"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-rose-500' : ''}`} />
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              className="p-2 rounded-xl transition hover:opacity-70"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
              title="Export as JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Grid ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 flex-1" style={{ gridTemplateColumns: selectedItem ? '1fr 420px' : '1fr' }}>

        {/* ── DLQ Table ───────────────────────────────────────────────────── */}
        <div className="flex flex-col rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0a0d16' }}>

          {/* Table head */}
          <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest"
            style={{
              color: '#475569',
              background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              gridTemplateColumns: '20px 56px 1fr 1fr 120px 88px'
            }}>
            <span />
            <span>Status</span>
            <span>Event / Project</span>
            <span>Error Reason</span>
            <span>Attempts</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Rows */}
          <div className="overflow-y-auto" style={{ maxHeight: 540 }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="p-4 rounded-2xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>All clear — no failed events</p>
                <p className="text-xs" style={{ color: '#475569' }}>All webhooks are delivering successfully.</p>
              </div>
            ) : filteredItems.map((item, idx) => {
              const eventId  = item.id || item.event_id || `evt_${idx}`;
              const eventType = item.event_type || 'webhook.failed';
              const attempts = item.attempt_number || item.attempts_count || item.retry_count || 1;
              const sev      = getAttemptSeverity(attempts);
              const errClass = classifyError(item.error_message);
              const ErrIcon  = errClass.icon;
              const isSelected = selectedItem?.id === item.id || selectedItem?.event_id === eventId;
              const isChecked  = selectedIds.includes(eventId);
              const isRemoving = removingIds.has(String(item.id)) || removingIds.has(String(item.event_id));
              const rowAction  = actionLoading[eventId];

              return (
                <div
                  key={eventId}
                  onClick={() => setSelectedItem(isSelected ? null : item)}
                  className="grid items-center px-4 py-3 cursor-pointer transition-all"
                  style={{
                    gridTemplateColumns: '20px 56px 1fr 1fr 120px 88px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isSelected
                      ? 'rgba(244,63,94,0.06)'
                      : isRemoving
                      ? 'rgba(16,185,129,0.05)'
                      : 'transparent',
                    borderLeft: isSelected ? '2px solid #f43f5e' : '2px solid transparent',
                    opacity: isRemoving ? 0.4 : 1,
                    transform: isRemoving ? 'translateX(8px)' : 'none',
                    transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleSelect(eventId); }}
                    className="transition hover:scale-110"
                    style={{ color: isChecked ? '#f43f5e' : '#334155' }}
                  >
                    {isChecked ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  </button>

                  {/* Severity badge */}
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[9px] font-extrabold"
                    style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`, letterSpacing: '0.06em' }}>
                    {sev.label}
                  </span>

                  {/* Event / Project */}
                  <div className="min-w-0 pr-3">
                    <div className="text-[11px] font-bold font-mono truncate" style={{ color: '#e2e8f0' }}>
                      {eventType}
                    </div>
                    <div className="text-[10px] font-mono truncate mt-0.5" style={{ color: '#475569' }}>
                      {item.project_name || (item.project_id ? `Project #${item.project_id}` : '—')}
                      {item.created_at && (
                        <span className="ml-2" style={{ color: '#334155' }}>{formatRelativeTime(item.created_at)}</span>
                      )}
                    </div>
                  </div>

                  {/* Error */}
                  <div className="min-w-0 pr-3 flex items-center gap-1.5">
                    <ErrIcon className="h-3 w-3 shrink-0" style={{ color: errClass.color }} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono truncate" style={{ color: '#94a3b8' }}>
                        {item.error_message || 'No error detail'}
                      </div>
                      <div className="text-[10px] font-mono truncate mt-0.5" style={{ color: '#334155' }}>
                        {item.target_url || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Attempts */}
                  <AttemptBar attempts={attempts} />

                  {/* Row actions */}
                  <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleReplay([eventId], true)}
                      disabled={!!rowAction}
                      className="p-1.5 rounded-lg transition active:scale-90 disabled:opacity-50"
                      style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', color: '#f43f5e' }}
                      title="Replay now"
                    >
                      {rowAction === 'replay'
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Play className="h-3 w-3 fill-current" />}
                    </button>
                    <button
                      onClick={() => handleDiscard([eventId], true)}
                      disabled={!!rowAction}
                      className="p-1.5 rounded-lg transition active:scale-90 disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
                      title="Discard permanently"
                    >
                      {rowAction === 'discard'
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Trash2 className="h-3 w-3" />}
                    </button>
                    <ChevronRight
                      className="h-3.5 w-3.5 transition-transform"
                      style={{ color: '#334155', transform: isSelected ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {filteredItems.length > 0 && (
            <div className="px-4 py-2.5 flex items-center justify-between text-[10px]"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#475569' }}>
              <span>Showing {filteredItems.length} failed event{filteredItems.length !== 1 ? 's' : ''}</span>
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {selectedIds.length} selected
              </span>
            </div>
          )}
        </div>

        {/* ── Inspector Drawer ─────────────────────────────────────────────── */}
        {selectedItem && (
          <div className="rounded-2xl overflow-hidden flex flex-col"
            style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#080b13' }}>

            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-3 text-xs font-bold">
                {['details', 'raw'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setInspectorTab(tab)}
                    className="pb-0.5 transition capitalize"
                    style={{
                      color: inspectorTab === tab ? '#f1f5f9' : '#475569',
                      borderBottom: inspectorTab === tab ? '2px solid #f43f5e' : '2px solid transparent',
                    }}
                  >
                    {tab === 'raw' ? 'Raw JSON' : 'Details'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyPayload(inspectorTab === 'raw' ? sel : sel.payload)}
                  className="flex items-center gap-1 text-[11px] transition"
                  style={{ color: copied ? '#10b981' : '#475569' }}
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1 rounded-lg transition"
                  style={{ color: '#475569' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer body */}
            <div className="overflow-y-auto flex-1 p-4">
              {inspectorTab === 'details' ? (
                <div className="space-y-4 text-xs">

                  {/* Severity banner */}
                  {(() => {
                    const n   = Number(sel.attempt_number || sel.attempts_count || sel.retry_count || 1);
                    const sev = getAttemptSeverity(n);
                    const ec  = classifyError(sel.error_message);
                    const EI  = ec.icon;
                    return (
                      <div className="rounded-xl p-3 flex items-center gap-3"
                        style={{ background: sev.bg, border: `1px solid ${sev.border}` }}>
                        <div className="p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)' }}>
                          <EI className="h-4 w-4" style={{ color: sev.color }} />
                        </div>
                        <div>
                          <div className="font-extrabold" style={{ color: sev.color }}>{sev.label} — {ec.label} Error</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>
                            {n} of 5 max attempts exhausted
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Details rows */}
                  {[
                    ['Event ID',     sel.event_id || sel.id, 'mono'],
                    ['Event Type',   sel.event_type, 'mono accent'],
                    ['Project',      sel.project_name || `#${sel.project_id}`, 'normal'],
                    ['Target URL',   sel.target_url, 'mono truncate'],
                    ['Failed At',    formatRelativeTime(sel.created_at), 'normal'],
                  ].map(([label, value, style]) => value && (
                    <div key={label} className="flex items-start justify-between gap-2">
                      <span style={{ color: '#475569', minWidth: 80 }}>{label}</span>
                      <span
                        className={`text-right break-all ${style?.includes('mono') ? 'font-mono' : ''} ${style?.includes('truncate') ? 'truncate max-w-[200px]' : ''}`}
                        style={{ color: style?.includes('accent') ? '#f43f5e' : '#cbd5e1', fontWeight: style?.includes('mono') ? 600 : 400 }}
                        title={value}
                      >
                        {String(value)}
                      </span>
                    </div>
                  ))}

                  {/* Attempts progress */}
                  <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
                      Retry Attempts
                    </div>
                    <AttemptBar attempts={sel.attempt_number || sel.attempts_count || sel.retry_count || 1} />
                  </div>

                  {/* Error detail */}
                  {sel.error_message && (
                    <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)' }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#f43f5e' }}>
                        <AlertCircle className="h-3 w-3" />
                        FAILURE DETAIL
                      </div>
                      <p className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: '#fca5a5' }}>
                        {sel.error_message}
                      </p>
                    </div>
                  )}

                  {/* Payload */}
                  {sel.payload && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
                        Event Payload
                      </div>
                      <pre className="p-3 rounded-xl text-[11px] leading-relaxed overflow-x-auto font-mono"
                        style={{ background: '#060810', border: '1px solid rgba(255,255,255,0.06)', color: '#67e8f9', maxHeight: 180 }}>
                        {JSON.stringify(sel.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* CTA buttons */}
                  <div className="pt-3 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                      onClick={() => handleReplay([sel.event_id || sel.id], true)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition active:scale-95"
                      style={{ background: '#e11d48', color: '#fff', boxShadow: '0 0 16px rgba(244,63,94,0.3)' }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Replay Event
                    </button>
                    <button
                      onClick={() => handleDiscard([sel.event_id || sel.id], true)}
                      className="px-4 py-2.5 rounded-xl font-medium text-xs transition hover:opacity-70"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-3 w-3 text-indigo-400" />
                      Full Raw DLQ Object
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px]" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>JSON</span>
                  </div>
                  <pre className="p-4 rounded-xl text-[11px] leading-relaxed overflow-auto font-mono"
                    style={{ background: '#060810', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', maxHeight: 500 }}>
                    {JSON.stringify(sel, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;
  return <ProtectedLayout>{content}</ProtectedLayout>;
}
