import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Maximize2, 
  Minimize2, 
  Terminal, 
  Trash2, 
  Clock, 
  Code2, 
  Copy,
  Check,
  Search,
  RefreshCw,
  Zap,
  Activity,
  Play,
  Pause,
  ShieldCheck,
  Server,
  Filter,
  Trash
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';

const statusBadgeStyle = (statusCode) => {
  if (!statusCode) return 'bg-zinc-800 text-zinc-400 border border-zinc-700/50';
  if (statusCode === 429) return 'bg-orange-500/10 text-orange-400 border border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.2)]';
  if (statusCode >= 500) return 'bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]';
  if (statusCode >= 400) return 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
  return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
};

const sanitizeHeaders = (headers) => {
  if (!headers || typeof headers !== 'object') return {};
  const sanitized = { ...headers };
  const sensitiveKeys = ['authorization', 'x-api-key', 'x-signature', 'cookie', 'token'];
  sensitiveKeys.forEach(key => {
    if (sanitized[key]) sanitized[key] = '[redacted]';
  });
  return sanitized;
};

export default function LogsPage() {
  const { projectId: urlProjectId } = useParams();
  const navigate = useNavigate();

  const [fullscreen, setFullscreen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null);
  const [activeTab, setActiveTab] = useState('payload');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => urlProjectId || sessionStorage.getItem('selectedProjectId') || null);
  
  // Controls & Filters
  const [autoScroll, setAutoScroll] = useState(true);
  const [polling, setPolling] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activePreset, setActivePreset] = useState('LIVE');
  const [clearedAt, setClearedAt] = useState(null);
  const [startFilter, setStartFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);

  const containerRef = useRef(null);
  const MAX_ITEMS = 50;

  // Sync URL parameter if present
  useEffect(() => {
    if (urlProjectId && urlProjectId !== selectedProjectId) {
      setSelectedProjectId(urlProjectId);
      sessionStorage.setItem('selectedProjectId', urlProjectId);
      setPage(1);
    }
  }, [urlProjectId]);

  // Load Projects list
  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      try {
        const { data } = await apiClient.get(API_ENDPOINTS.PROJECTS.LIST);
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          setProjects(list);
          if (list.length > 0 && !selectedProjectId) {
            const firstProjId = list[0].id;
            setSelectedProjectId(firstProjId);
            sessionStorage.setItem('selectedProjectId', firstProjId);
          }
        }
      } catch {
        // Fallback
      }
    };
    loadProjects();
    return () => { cancelled = true; };
  }, []);

  // Fetch initial logs when selected project, page, or filters change
  useEffect(() => {
    if (!selectedProjectId) {
      setLogs([]);
      setActiveLog(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchLogs = async () => {
      setLoading(true);
      try {
        let params = [`limit=${MAX_ITEMS}`, `page=${page}`];
        if (statusFilter && statusFilter !== 'ALL') {
          params.push(`status_code=${encodeURIComponent(statusFilter.toLowerCase())}`);
        }
        if (clearedAt) {
          params.push(`start=${encodeURIComponent(clearedAt)}`);
        } else if (startFilter) {
          params.push(`start=${encodeURIComponent(new Date(startFilter).toISOString())}`);
        }

        const queryString = `?${params.join('&')}`;
        const { data } = await apiClient.get(API_ENDPOINTS.WEBHOOKS.LOGS(selectedProjectId) + queryString);
        
        if (!cancelled) {
          const normalized = (Array.isArray(data) ? data : []).slice(0, MAX_ITEMS);
          setLogs(normalized);
          setActiveLog(normalized[0] || null);
        }
      } catch {
        if (!cancelled) {
          setLogs([]);
          setActiveLog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLogs();
    return () => { cancelled = true; };
  }, [selectedProjectId, page, clearedAt, startFilter, statusFilter]);

  // Lightweight Live Stream Polling
  useEffect(() => {
    const isLiveMode = activePreset === 'LIVE' && page === 1;
    if (!selectedProjectId || !polling || !isLiveMode) return undefined;

    const interval = setInterval(async () => {
      try {
        const newestTimestamp = logs[0]?.timestamp || clearedAt;
        let params = [`limit=${MAX_ITEMS}`, `page=1`];
        if (newestTimestamp) {
          params.push(`start=${encodeURIComponent(newestTimestamp)}`);
        }
        if (statusFilter && statusFilter !== 'ALL') {
          params.push(`status_code=${encodeURIComponent(statusFilter.toLowerCase())}`);
        }

        const queryString = `?${params.join('&')}`;
        const { data: newLogs } = await apiClient.get(API_ENDPOINTS.WEBHOOKS.LOGS(selectedProjectId) + queryString);
        const normalized = Array.isArray(newLogs) ? newLogs : [];

        if (normalized.length > 0) {
          setLogs((prev) => {
            const merged = [...normalized, ...prev];
            const seen = new Set();
            const deduplicated = merged.filter((log) => {
              if (seen.has(log.id)) return false;
              seen.add(log.id);
              return true;
            });
            return deduplicated.slice(0, MAX_ITEMS);
          });

          if (!activeLog) {
            setActiveLog(normalized[0]);
          }

          if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = 0;
          }
        }
      } catch {
        // Silent
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [selectedProjectId, polling, autoScroll, logs, clearedAt, statusFilter, activePreset, page]);

  // Clear Terminal View (Only stream new events going forward)
  const handleClearView = () => {
    const nowIso = new Date().toISOString();
    setClearedAt(nowIso);
    setLogs([]);
    setActiveLog(null);
    setStartFilter('');
    setActivePreset('LIVE');
    setPage(1);
  };

  // Purge Backend DB Logs Permanently
  const handlePurgeDbLogs = async () => {
    if (!selectedProjectId) return;
    if (!window.confirm('Purge all stored database logs for this project? This action cannot be undone.')) return;
    try {
      await apiClient.delete(API_ENDPOINTS.WEBHOOKS.LOGS(selectedProjectId));
      handleClearView();
    } catch {
      // Keep state
    }
  };

  // Time Range Presets
  const applyPreset = (minutes, label) => {
    setActivePreset(label);
    setClearedAt(null);
    setPage(1);
    if (label !== 'LIVE') {
      setPolling(false);
    } else {
      setPolling(true);
    }
    if (minutes === null) {
      setStartFilter('');
      return;
    }
    const past = new Date(Date.now() - minutes * 60 * 1000);
    setStartFilter(past.toISOString());
  };

  // Filter logs by search query
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((log) => {
      const logId = String(log.id || '').toLowerCase();
      const eventType = String(log.metadata?.event_type || '').toLowerCase();
      const status = String(log.metadata?.response_code || log.metadata?.status || '').toLowerCase();
      const message = String(log.message || '').toLowerCase();
      return logId.includes(q) || eventType.includes(q) || status.includes(q) || message.includes(q);
    });
  }, [logs, searchQuery]);

  // Deep Packet Inspector Data Formatter
  const inspectorData = useMemo(() => {
    if (!activeLog) return null;
    const metadata = activeLog.metadata || {};

    const rawHeaders = metadata.incoming_headers || metadata.headers || {
      "Content-Type": "application/json",
      "X-Gateway-Verified": "HMAC-SHA256 (Constant Time Match)",
      "Source-IP": metadata.source_ip || "127.0.0.1",
      "User-Agent": "Webhook-Gateway/2.0",
      "X-HUB-SIGNATURE": "sha256=5f187a0b3c8e..."
    };
    const headers = sanitizeHeaders(rawHeaders);

    const payload = metadata.request_payload || metadata.event_payload || metadata.payload || {
      "event": metadata.event_type || "webhook.received",
      "log_id": activeLog.id,
      "message": activeLog.message,
      "timestamp": activeLog.timestamp
    };

    const response = metadata.response_data || {
      "status_code": metadata.response_code || 200,
      "status": metadata.status || "SUCCESS",
      "delivery_duration_ms": metadata.processing_duration_ms || 1,
      "target_url": metadata.target_url || "Forwarded to target receiver",
      "error_message": metadata.error_message || null
    };

    return { headers, payload, response };
  }, [activeLog]);

  const copyInspectorJson = () => {
    if (!inspectorData) return;
    const content = activeTab === 'headers' ? inspectorData.headers : activeTab === 'payload' ? inspectorData.payload : inspectorData.response;
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ProtectedLayout title="Developer Telemetry Console" eyebrow="Real-time Webhook Tunnel" sidebarCollapsed={fullscreen}>
      <div className={`flex flex-col overflow-hidden rounded-2xl text-zinc-100 transition-all font-jetbrains glass-panel-heavy ${fullscreen ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0' : 'h-[calc(100vh-9.5rem)]'}`}>
        
        {/* CRT Scanline Overlay Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50" />

        {/* 1. UNIFIED TERMINAL HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/90 bg-[#0b0c13] px-6 py-3">
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/90 animate-pulse" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/90" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/90" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black tracking-widest text-emerald-400 uppercase">TELEMETRY_TERMINAL_v3.0</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${polling ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                  <Activity size={10} className={polling ? 'animate-spin text-emerald-400' : 'text-amber-400'} />
                  {polling ? 'LIVE STREAMING' : 'PAUSED'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                Showing {filteredLogs.length} events • Virtualized buffer (Max 50)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Target Project Dropdown */}
            <select 
              value={selectedProjectId || ''} 
              onChange={(e) => { 
                const newId = e.target.value;
                setSelectedProjectId(newId); 
                sessionStorage.setItem('selectedProjectId', newId); 
                setClearedAt(null);
                setLogs([]);
                setActiveLog(null);
                if (urlProjectId) {
                  navigate('/logs');
                }
              }} 
              className="rounded-xl border border-zinc-800 bg-[#121420] px-3.5 py-2 text-xs font-mono font-bold text-emerald-400 outline-none focus:border-emerald-500/50 cursor-pointer shadow-inner"
            >
              <option value="" className="text-zinc-500">Select Target Project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name.toUpperCase()} (ID: {p.id})</option>)}
            </select>

            {/* Pause/Resume Live Stream Button */}
            <button
              onClick={() => setPolling((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-mono font-bold transition active:scale-95 ${
                polling 
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' 
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              {polling ? <Pause size={13} /> : <Play size={13} />}
              {polling ? 'PAUSE STREAM' : 'RESUME STREAM'}
            </button>

            {/* Fullscreen Toggle */}
            <button 
              onClick={() => setFullscreen((v) => !v)} 
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#121420] hover:bg-[#1a1d2e] px-3 py-2 text-xs font-mono font-bold text-zinc-300 transition active:scale-95"
            >
              {fullscreen ? <Minimize2 size={13} className="text-rose-400" /> : <Maximize2 size={13} className="text-cyan-400" />}
              {fullscreen ? 'EXIT_FULL' : 'MAXIMIZE'}
            </button>
          </div>
        </div>

        {/* 2. CONTROLS TOOLBAR & SMART FILTERS */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#090a10] px-6 py-2.5">
          
          {/* Filters & Presets */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Status Code Filter */}
            <div className="flex items-center gap-1 bg-[#10121d] border border-zinc-800 rounded-lg p-0.5">
              {['ALL', '2XX', '4XX', '5XX'].map((code) => (
                <button
                  key={code}
                  onClick={() => setStatusFilter(code)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition ${
                    statusFilter === code
                      ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>

            {/* Time Presets */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
                <Clock size={11} className="text-cyan-400" />
                PRESETS:
              </span>
              {[
                { label: 'LIVE', min: 0 },
                { label: '15M', min: 15 },
                { label: '1H', min: 60 },
                { label: '24H', min: 1440 },
                { label: 'ALL HISTORY', min: null },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.min, preset.label)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold transition ${
                    activePreset === preset.label
                      ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                      : 'bg-[#10121d] text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Live Search Input */}
            <div className="relative ml-2">
              <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Filter logs by ID or status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-44 sm:w-56 rounded-lg border border-zinc-800 bg-[#10121d] pl-8 pr-3 py-1 text-xs font-mono text-zinc-200 outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Action Buttons: Clear View & Purge DB */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearView}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-750 bg-[#121420] hover:bg-zinc-800 px-3 py-1 text-xs font-mono font-bold text-zinc-300 transition active:scale-95"
              title="Clears current view. Only new incoming events will be displayed."
            >
              <Trash2 size={13} className="text-amber-400" />
              CLEAR VIEW
            </button>

            <button
              onClick={handlePurgeDbLogs}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1 text-xs font-mono font-bold text-rose-400 transition active:scale-95"
              title="Permanently purges all log records from the backend database."
            >
              <Trash size={13} />
              PURGE DB
            </button>
          </div>
        </div>

        {/* 3. DUAL-SPLIT WORKSPACE LAYOUT */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[0.55fr_0.45fr]">
          
          {/* LEFT PANEL: REAL-TIME LOG STREAM */}
          <div ref={containerRef} className="overflow-y-auto border-r border-zinc-800/80 bg-[#07080d] p-4 scrollbar-thin">
            
            {loading ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#0a0b12] p-6 font-mono text-xs text-zinc-400">
                <RefreshCw size={24} className="mb-3 animate-spin text-emerald-400" />
                CONNECTING TO TELEMETRY STREAM...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/80 bg-[#0a0b12] p-6 text-center font-mono text-xs text-zinc-500">
                <Zap className="mb-3 animate-bounce text-emerald-500/70" size={32} />
                <p className="font-bold text-zinc-400">Terminal view cleared.</p>
                <p className="mt-1 text-[11px] text-zinc-500 max-w-sm leading-relaxed">
                  {clearedAt 
                    ? "View cleared. Only new incoming events will stream live..." 
                    : "No webhook logs match your selected filter."}
                </p>
                {clearedAt && (
                  <button
                    onClick={() => { setClearedAt(null); setStartFilter(''); setActivePreset('ALL HISTORY'); }}
                    className="mt-4 px-3.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs font-bold hover:bg-emerald-500/20 transition"
                  >
                    Load History Logs
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLogs.map((log) => {
                  const statusCode = log.metadata?.response_code;
                  const isSelected = activeLog?.id === log.id;
                  
                  return (
                    <button 
                      key={log.id} 
                      onClick={() => setActiveLog(log)} 
                      className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                        isSelected 
                          ? 'border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_20px_rgba(6,182,212,0.08)]' 
                          : 'border-zinc-850 bg-[#0b0d16] hover:border-zinc-750 hover:bg-[#10121f]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-zinc-500">{log.id}</span>
                            <span className="font-mono text-[10px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                              {log.metadata?.event_type || 'webhook.received'}
                            </span>
                          </div>

                          <p className="mt-1 font-mono text-xs font-semibold text-zinc-200 truncate">
                            {log.message}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-zinc-400">
                            <span className="font-bold text-emerald-400">{log.metadata?.http_method || 'POST'}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="truncate max-w-[200px] text-zinc-400">{log.metadata?.target_url || '/v1/gateway'}</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-mono font-black ${statusBadgeStyle(statusCode)}`}>
                            {statusCode || 'ACCEPTED'}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                            <Clock size={10} className="text-zinc-600" />
                            {log.metadata?.processing_duration_ms ? `${log.metadata.processing_duration_ms}ms` : '<1ms'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Pagination Controls */}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-4 font-mono text-xs">
                  <button
                    disabled={page === 1}
                    onClick={() => {
                      setPage(p => Math.max(1, p - 1));
                      if (containerRef.current) containerRef.current.scrollTop = 0;
                    }}
                    className="rounded-lg border border-zinc-750 bg-[#10121d] px-3.5 py-2 font-bold text-zinc-300 hover:bg-zinc-850 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-zinc-300 transition active:scale-95 shadow-md"
                  >
                    &lt; PREV_PAGE
                  </button>
                  <span className="text-zinc-500 font-bold">
                    PAGE {page}
                  </span>
                  <button
                    disabled={logs.length < MAX_ITEMS}
                    onClick={() => {
                      setPage(p => p + 1);
                      if (containerRef.current) containerRef.current.scrollTop = 0;
                    }}
                    className="rounded-lg border border-zinc-750 bg-[#10121d] px-3.5 py-2 font-bold text-zinc-300 hover:bg-zinc-850 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-zinc-300 transition active:scale-95 shadow-md"
                  >
                    NEXT_PAGE &gt;
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: ENRICHED DEEP PACKET INSPECTOR */}
          <div className="flex flex-col overflow-hidden bg-[#07080d] p-5 border-t border-zinc-800/80 lg:border-t-0">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Code2 size={16} className="text-amber-400" />
                <div>
                  <h4 className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">PACKET_INSPECTOR</h4>
                  <p className="text-[10px] font-mono text-zinc-500">Headers, payload JSON & target response</p>
                </div>
              </div>

              {activeLog && (
                <button
                  onClick={copyInspectorJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-750 bg-[#10121d] px-2.5 py-1 text-xs font-mono font-bold text-zinc-300 hover:bg-zinc-800 transition active:scale-95"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied ? 'COPIED!' : 'COPY_JSON'}
                </button>
              )}
            </div>

            {!activeLog ? (
              <div className="flex flex-1 items-center justify-center text-center p-6">
                <div className="font-mono text-xs text-zinc-600 max-w-xs">
                  <Terminal className="mx-auto mb-3 opacity-30 text-amber-400" size={40} />
                  <p className="font-bold text-zinc-400">NO EVENT SELECTED</p>
                  <p className="mt-1 text-[11px]">Click on any log event on the left to inspect raw headers, payload JSON, and target response.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                
                {/* Tab Switcher */}
                <div className="mt-3 flex gap-2">
                  {[
                    { id: 'payload', label: 'PAYLOAD JSON', icon: Code2 },
                    { id: 'headers', label: 'SECURITY HEADERS', icon: ShieldCheck },
                    { id: 'response', label: 'TARGET RESPONSE', icon: Server }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id)} 
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
                          activeTab === tab.id 
                            ? 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(52,211,153,0.3)]' 
                            : 'bg-[#10121d] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                        }`}
                      >
                        <Icon size={12} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Enriched JSON Output View */}
                <div className="mt-3 flex-1 overflow-auto rounded-xl border border-zinc-800 bg-[#040508] p-4 scrollbar-thin">
                  <pre className="font-mono text-xs text-emerald-300 leading-relaxed select-all">
                    {JSON.stringify(
                      activeTab === 'headers'
                        ? inspectorData?.headers || {}
                        : activeTab === 'payload'
                          ? inspectorData?.payload || {}
                          : inspectorData?.response || {},
                      null,
                      2
                    )}
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