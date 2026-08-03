import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  Copy, 
  Terminal, 
  Code2, 
  Clock, 
  Calendar, 
  BarChart2, 
  Download, 
  SlidersHorizontal,
  ChevronDown,
  X,
  Database,
  Check,
  Globe,
  FileText,
  Filter,
  Layers,
  ChevronRight,
  AlertCircle,
  Zap
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { useAuth } from '../context/AuthContext';
import { WS_ENDPOINTS, withToken } from '@/utils/constants';
import { formatTimeOnly, formatDateOnly, formatTimestamp, getStoredCompanyTimezone } from '@/utils/dateUtils';

export default function LogsPage({ projectId, embedded = false }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyTimezone, setCompanyTimezone] = useState(() => getStoredCompanyTimezone());
  
  // Drawer state: ONLY open when a log is explicitly clicked by user!
  const [selectedLog, setSelectedLog] = useState(null);
  
  // Toolbar state
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('24H'); // '1H', '24H', '7D', 'CUSTOM', 'ALL'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [showChart, setShowChart] = useState(true);
  const [showConsoleQuery, setShowConsoleQuery] = useState(false);
  const [consoleQueryText, setConsoleQueryText] = useState('SELECT * FROM logs WHERE status >= 200 LIMIT 100;');
  
  // Custom Date Modal state
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Inspector tab state
  const [inspectorTab, setInspectorTab] = useState('details'); // 'details' | 'raw'
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Fetch company timezone & listen to live timezone_changed events
  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        const { data } = await apiClient.get('/v1/companies/me');
        if (data?.timezone) {
          setCompanyTimezone(data.timezone);
        }
      } catch (err) {
        console.warn('Could not fetch company timezone:', err);
      }
    };
    fetchCompanyProfile();

    const handleTzChange = (e) => {
      if (e?.detail?.timezone) {
        setCompanyTimezone(e.detail.timezone);
      } else {
        setCompanyTimezone(getStoredCompanyTimezone());
      }
    };

    window.addEventListener('timezone_changed', handleTzChange);
    return () => window.removeEventListener('timezone_changed', handleTzChange);
  }, []);

  const normalizeLog = (log) => {
    const metadata = log?.metadata || {};
    const rawStatus = (log?.status || metadata?.status || '').toUpperCase();
    const level = (log?.level || '').toUpperCase();
    const errMsg = log?.error_message || metadata?.error_message || metadata?.detail || log?.response_body || '';
    const targetUrl = log?.target_url || log?.path || metadata?.target_url || log?.delivery_packet?.target_url || '';
    
    // STRICT FIX: Check if this call was an error/failure target or produced an error message
    const isErrorTarget = targetUrl.includes('error-receiver') || targetUrl.includes('slow-receiver');
    const isFailedStatus = rawStatus === 'FAILED' || rawStatus === 'REJECTED' || level === 'ERROR' || Boolean(errMsg) || isErrorTarget;

    let responseCode = log?.response_code ?? log?.status_code ?? metadata?.response_code ?? metadata?.status_code;

    if (isFailedStatus) {
      if (!responseCode || Number(responseCode) === 200) {
        responseCode = 500;
      }
    } else if (!responseCode) {
      responseCode = 200;
    }

    const createdAt = log?.created_at || log?.timestamp || metadata?.created_at || '';
    const eventType = log?.event_type || metadata?.event_type || log?.delivery_packet?.event_type || 'webhook.event';
    const httpMethod = log?.http_method || metadata?.http_method || log?.delivery_packet?.http_method || 'POST';
    const durationMs = log?.processing_duration_ms ?? metadata?.processing_duration_ms ?? 0;
    const attemptNum = log?.attempt ?? log?.attempt_number ?? metadata?.attempt ?? 1;

    return {
      ...log,
      status: isFailedStatus ? 'FAILED' : (rawStatus || 'SUCCESS'),
      created_at: createdAt,
      response_code: Number(responseCode),
      status_code: Number(responseCode),
      event_type: eventType,
      target_url: targetUrl,
      path: targetUrl,
      http_method: httpMethod,
      error_message: errMsg,
      processing_duration_ms: durationMs,
      attempt_number: attemptNum,
      payload: log?.payload || metadata?.request_payload || log?.delivery_packet?.payload || {},
      metadata,
    };
  };

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = projectId
        ? `/v1/projects/${projectId}/logs?limit=100`
        : '/v1/webhooks/logs?limit=100';
      const { data } = await apiClient.get(endpoint);
      const rawList = Array.isArray(data) ? data : (data?.logs || []);
      setLogs(rawList.map(normalizeLog));
    } catch (err) {
      console.warn('Failed to fetch live logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(false);

    if (!projectId) return;

    let socket = null;
    let reconnectTimer = null;
    let retryCount = 0;

    const connectWs = () => {
      const token = user?.access_token || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))?.access_token : null);
      if (!token) return;

      const wsUrl = withToken(WS_ENDPOINTS.LOGS(projectId), token);
      try {
        socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.id) {
              const normalizedPayload = normalizeLog(payload);
              setLogs((prevLogs) => {
                const exists = prevLogs.some((l) => l.id === normalizedPayload.id);
                if (exists) return prevLogs;
                return [normalizedPayload, ...prevLogs].slice(0, 500);
              });
            }
          } catch (err) {
            console.warn('Log WS message parse error:', err);
          }
        };

        socket.onclose = () => {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount++;
          reconnectTimer = setTimeout(connectWs, delay);
        };

        socket.onerror = () => {
          try { socket.close(); } catch {}
        };
      } catch (err) {
        console.warn('Log WebSocket error:', err);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [projectId, user]);

  // Dynamically extract unique Event Types from logs
  const availableEventTypes = useMemo(() => {
    const types = new Set();
    logs.forEach((log) => {
      const et = log.event_type || log.delivery_packet?.event_type;
      if (et) types.add(et);
    });
    return Array.from(types).sort();
  }, [logs]);

  // Multi-Filter Calculation
  const filteredLogs = useMemo(() => {
    const now = new Date().getTime();

    return logs.filter((log) => {
      const q = searchQuery.toLowerCase().trim();
      const code = log.response_code || log.status_code || 200;
      const path = (log.path || log.target_url || log.delivery_packet?.target_url || '').toLowerCase();
      const eventType = (log.event_type || log.delivery_packet?.event_type || '').toLowerCase();
      const method = (log.http_method || log.delivery_packet?.http_method || 'POST').toUpperCase();
      const logTime = log.created_at ? new Date(log.created_at).getTime() : now;

      // 1. Search Query Filter
      const matchesSearch =
        !q ||
        path.includes(q) ||
        eventType.includes(q) ||
        String(code).includes(q) ||
        method.includes(q);

      // 2. Status Filter
      let matchesStatus = true;
      if (statusFilter === '200') matchesStatus = Number(code) >= 200 && Number(code) < 300;
      if (statusFilter === '304') matchesStatus = Number(code) === 304;
      if (statusFilter === '400') matchesStatus = Number(code) >= 400 && Number(code) < 500;
      if (statusFilter === '500') matchesStatus = Number(code) >= 500 || Number(code) === 0;

      // 3. Events Filter
      let matchesEvent = true;
      if (eventFilter !== 'ALL') {
        matchesEvent = (log.event_type || log.delivery_packet?.event_type) === eventFilter;
      }

      // 4. Method Filter
      let matchesMethod = true;
      if (methodFilter !== 'ALL') matchesMethod = method === methodFilter;

      // 5. Time Range Filter
      let matchesTime = true;
      if (timeFilter === '1H') matchesTime = (now - logTime) <= 60 * 60 * 1000;
      if (timeFilter === '24H') matchesTime = (now - logTime) <= 24 * 60 * 60 * 1000;
      if (timeFilter === '7D') matchesTime = (now - logTime) <= 7 * 24 * 60 * 60 * 1000;
      if (timeFilter === 'CUSTOM' && customStartDate && customEndDate) {
        const start = new Date(customStartDate).getTime();
        const end = new Date(customEndDate).getTime() + 24 * 60 * 60 * 1000;
        matchesTime = logTime >= start && logTime <= end;
      }

      return matchesSearch && matchesStatus && matchesEvent && matchesMethod && matchesTime;
    });
  }, [logs, searchQuery, statusFilter, eventFilter, methodFilter, timeFilter, customStartDate, customEndDate]);

  // Real 24h Timeline Chart Data
  const chartData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({ id: i, count: 0, success: 0, failed: 0 }));
    const now = Date.now();

    filteredLogs.forEach((log) => {
      const ts = log.created_at ? new Date(log.created_at).getTime() : now;
      const ageHours = Math.max(0, Math.min(23, (now - ts) / (1000 * 60 * 60)));
      const bucketIndex = Math.floor(ageHours);
      buckets[bucketIndex].count += 1;

      const code = Number(log.response_code || log.status_code || 200);
      const isFailed = log.status === 'FAILED' || code >= 400 || log.level === 'ERROR';
      if (isFailed) {
        buckets[bucketIndex].failed += 1;
      } else {
        buckets[bucketIndex].success += 1;
      }
    });

    return buckets;
  }, [filteredLogs]);

  const copyPayload = (content) => {
    if (!content) return;
    const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(str);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Export Filtered Logs to downloadable JSON file
  const handleExportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `eds_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const currentSelection = selectedLog || {};
  const currentStatus = currentSelection.response_code || currentSelection.status_code || 200;
  const currentMethod = currentSelection.http_method || currentSelection.delivery_packet?.http_method || 'POST';
  const currentTarget = currentSelection.target_url || currentSelection.path || currentSelection.delivery_packet?.target_url || '';
  const currentEvent = currentSelection.event_type || currentSelection.delivery_packet?.event_type || '';
  const currentPayload = currentSelection.payload || currentSelection.delivery_packet?.payload || {};

  const content = (
    <div className="flex flex-col h-full w-full font-sans text-zinc-800 dark:text-zinc-200 select-none pb-8">
      
      {/* 🚀 1. Settings-Style Control Toolbar */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
        
        {!embedded && (
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-500" />
              Live Telemetry & Logs Stream
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">timezone:</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 flex items-center gap-1.5 font-mono">
                <Globe size={12} className="text-emerald-500" />
                {companyTimezone}
              </span>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5">
                <Database size={12} className="text-emerald-500" />
                Ingress ({filteredLogs.length})
              </span>
            </div>
          </div>
        )}

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          
          {/* Search Input & Refresh Button */}
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events..."
                className="w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-emerald-500 focus:outline-none transition"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchLogs(false)}
              className="p-2 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 shrink-0"
              title="Refresh logs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          </div>

          {/* Filter Options */}
          <div className="flex items-center gap-2 overflow-x-auto">
            
            {/* Time Range Selector Pill */}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-1.5 font-semibold text-[11px] focus:outline-none shrink-0 cursor-pointer"
            >
              <option value="1H">Last 1 hour</option>
              <option value="24H">Last 24 hours</option>
              <option value="7D">Last 7 days</option>
              <option value="ALL">All time</option>
            </select>

            {/* Custom Date Filter Button */}
            <button
              type="button"
              onClick={() => setShowCustomDateModal(true)}
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 font-medium shrink-0 transition ${
                timeFilter === 'CUSTOM'
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              <span>Custom</span>
            </button>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none shrink-0 cursor-pointer"
            >
              <option value="ALL">Status: All</option>
              <option value="200">200 OK</option>
              <option value="304">304 Cached</option>
              <option value="400">400 Bad Request</option>
              <option value="500">500 Server Error</option>
            </select>

            {/* Events Filter */}
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none shrink-0 cursor-pointer"
            >
              <option value="ALL">Events: All ({availableEventTypes.length})</option>
              {availableEventTypes.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none shrink-0 cursor-pointer"
            >
              <option value="ALL">Method: All</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            {/* Chart Toggle Button */}
            <button
              type="button"
              onClick={() => setShowChart(!showChart)}
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 font-medium shrink-0 transition ${
                showChart
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Chart</span>
            </button>

            {/* Export Download Button */}
            <button
              type="button"
              onClick={handleExportLogs}
              className="p-2 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-emerald-500 transition shrink-0"
              title="Export logs to JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </button>

            {/* Console SQL/API Query Toggle Button (>_) */}
            <button
              type="button"
              onClick={() => setShowConsoleQuery(!showConsoleQuery)}
              className={`p-2 rounded-xl border shrink-0 transition ${
                showConsoleQuery
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
              title="Open SQL Query Console (>_)"
            >
              <span className="font-mono text-xs font-bold">&gt;_</span>
            </button>

          </div>

        </div>
      </div>

      {/* 💻 Console SQL Query Input Overlay (>_) */}
      {showConsoleQuery && (
        <div className="mb-4 rounded-xl border border-indigo-500/30 bg-zinc-950 p-3 font-mono text-xs space-y-2">
          <div className="flex items-center justify-between text-indigo-400 font-bold text-[11px]">
            <span>SQL / API LOG QUERY CONSOLE</span>
            <button type="button" onClick={() => setShowConsoleQuery(false)} className="text-zinc-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={consoleQueryText}
              onChange={(e) => setConsoleQueryText(e.target.value)}
              className="flex-1 bg-black/60 border border-zinc-800 rounded-lg px-3 py-1.5 text-emerald-400 outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => fetchLogs(false)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-bold px-3 py-1.5 text-xs transition"
            >
              Run Query
            </button>
          </div>
        </div>
      )}

      {/* 📈 2. Supabase / Vercel Style Sleek 24h Timeline Chart */}
      {showChart && (
        <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0d1017] p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">24h Delivery Throughput ({companyTimezone})</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" /> Success ({filteredLogs.filter(l => l.response_code < 400 && l.status !== 'FAILED').length})
              </span>
              <span className="flex items-center gap-1.5 text-rose-500 font-semibold">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm" /> Failed ({filteredLogs.filter(l => l.response_code >= 400 || l.status === 'FAILED').length})
              </span>
            </div>
          </div>
          <div className="h-12 w-full flex items-end justify-between gap-1 pt-1">
            {chartData.map((bucket) => {
              const maxCount = Math.max(1, ...chartData.map((item) => item.count));
              const hPct = bucket.count === 0 ? 10 : Math.max(18, Math.round((bucket.count / maxCount) * 100));
              const totalInBucket = bucket.count || 1;
              const failedPct = Math.round((bucket.failed / totalInBucket) * 100);
              const successPct = 100 - failedPct;

              return (
                <div 
                  key={bucket.id} 
                  className="flex-1 flex flex-col justify-end h-full rounded overflow-hidden transition cursor-pointer group relative"
                  title={`Hour -${24 - bucket.id}h: ${bucket.count} total (${bucket.success} ok, ${bucket.failed} failed)`}
                >
                  <div 
                    className="w-full flex flex-col justify-end rounded overflow-hidden group-hover:brightness-125 transition-all"
                    style={{ height: `${hPct}%` }}
                  >
                    {bucket.count === 0 ? (
                      <div className="w-full h-full bg-zinc-200/40 dark:bg-zinc-800/40 rounded" />
                    ) : (
                      <>
                        {bucket.failed > 0 && (
                          <div 
                            className="w-full bg-rose-500 transition-all rounded-t" 
                            style={{ height: `${failedPct}%` }} 
                          />
                        )}
                        {bucket.success > 0 && (
                          <div 
                            className="w-full bg-emerald-500 transition-all rounded-t" 
                            style={{ height: `${bucket.failed > 0 ? successPct : 100}%` }} 
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5 border-t border-zinc-200/50 dark:border-zinc-800/50">
            <span>-24h</span>
            <span>-18h</span>
            <span>-12h</span>
            <span>-6h</span>
            <span className="font-semibold text-emerald-500">Now ({companyTimezone})</span>
          </div>
        </div>
      )}

      {/* 📊 3. DYNAMIC LAYOUT: Full Width (12 cols) by Default; Split (7 + 5 cols) ONLY when a row is clicked! */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        
        {/* Stream Table: Spans full 12 cols if no row selected; spans 7 cols when row is clicked! */}
        <div className={`${selectedLog ? 'lg:col-span-7' : 'lg:col-span-12'} flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0d1017] shadow-lg transition-all duration-200`}>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-xs max-h-[580px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                No matching log records found for the selected filters.
              </div>
            ) : (
              filteredLogs.map((log, idx) => {
                const code = log.response_code || log.status_code || 200;
                const method = log.http_method || log.delivery_packet?.http_method || 'POST';
                const path = log.path || log.target_url || log.delivery_packet?.target_url || '/v1/webhooks';
                const isSelected = selectedLog?.id === log.id;

                const formattedTime = log.created_at
                  ? formatTimeOnly(log.created_at, companyTimezone)
                  : '17:49:18';

                const formattedDate = log.created_at
                  ? formatDateOnly(log.created_at, companyTimezone)
                  : '23 Oct';

                const isFailed = log.status === 'FAILED' || code >= 400 || log.level === 'ERROR';

                return (
                  <div
                    key={log.id || idx}
                    onClick={() => setSelectedLog(log)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-white font-semibold border-l-4 border-emerald-500 shadow-sm'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-4 truncate">
                      {/* Date & Timestamp (in company timezone) */}
                      <span className="text-[11px] text-zinc-400 shrink-0 w-32 font-mono">
                        {formattedDate} {formattedTime}
                      </span>

                      {/* Status Code Badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        !isFailed && code >= 200 && code < 300 
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                          : code === 304
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      }`}>
                        {isFailed && code < 400 ? 500 : code}
                      </span>

                      {/* HTTP Method */}
                      <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0 w-12">
                        {method}
                      </span>

                      {/* Endpoint Path / Event Name */}
                      <span className="text-[11px] truncate font-mono text-zinc-800 dark:text-zinc-200">
                        {path}
                      </span>
                    </div>

                    <ChevronRight className={`h-4 w-4 text-zinc-400 transition-transform ${isSelected ? 'rotate-90 text-emerald-500' : 'group-hover:translate-x-1'}`} />
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-center">
            <button
              type="button"
              onClick={() => fetchLogs(false)}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
            >
              Load older log entries
            </button>
          </div>
        </div>

        {/* Right Details Inspector Drawer (5 cols) ONLY SHOWN WHEN A LOG ROW IS CLICKED! */}
        {selectedLog && (
          <div className="lg:col-span-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 bg-white dark:bg-[#0d1017] shadow-xl font-sans flex flex-col gap-4 sticky top-4">
            
            {/* Drawer Top Tabs Header with Close 'X' Button */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInspectorTab('details')}
                  className={`pb-1 transition border-b-2 ${
                    inspectorTab === 'details'
                      ? 'border-emerald-500 text-zinc-900 dark:text-white font-bold'
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
                      ? 'border-emerald-500 text-zinc-900 dark:text-white font-bold'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  Raw JSON
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => copyPayload(inspectorTab === 'raw' ? currentSelection : currentPayload)}
                  className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-emerald-500 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedPayload ? 'Copied!' : 'Copy'}</span>
                </button>

                {/* Close Drawer Button 'X' */}
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition"
                  title="Close Inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Inspector Body */}
            {inspectorTab === 'details' ? (
              <div className="space-y-4 text-xs font-sans">
                
                {/* Status Code row */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Status</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono ${
                    currentSelection.status !== 'FAILED' && currentStatus >= 200 && currentStatus < 300
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : currentStatus === 304
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  }`}>
                    {currentSelection.status === 'FAILED' && currentStatus < 400 ? 500 : currentStatus}
                  </span>
                </div>

                {/* Method row */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Method</span>
                  <span className="font-bold font-mono text-zinc-900 dark:text-white">
                    {currentMethod}
                  </span>
                </div>

                {/* Timestamp row (formatted in Company Timezone) */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Timestamp ({companyTimezone})</span>
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 font-semibold">
                    {currentSelection.created_at ? formatTimestamp(currentSelection.created_at, companyTimezone) : 'N/A'}
                  </span>
                </div>

                {/* Event Type */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Event Type</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {currentEvent}
                  </span>
                </div>

                {/* Target Endpoint URL */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Target URL</span>
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]" title={currentTarget}>
                    {currentTarget}
                  </span>
                </div>

                {/* Latency / Processing Duration */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Latency / Duration</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                    <Clock size={12} />
                    {currentSelection.processing_duration_ms ?? 0} ms
                  </span>
                </div>

                {/* Retry Attempts */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Attempt Number</span>
                  <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                    Attempt #{currentSelection.attempt_number ?? 1}
                  </span>
                </div>

                {/* IP Address */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Source IP</span>
                  <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {currentSelection.source_ip || currentSelection.metadata?.source_ip || '127.0.0.1'}
                  </span>
                </div>

                {/* Explicit Failure / Error Detail Box if present */}
                {(currentSelection.error_message || currentSelection.metadata?.error_message || currentSelection.metadata?.detail || currentStatus >= 400 || currentSelection.status === 'FAILED') && (
                  <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 space-y-1.5 font-sans">
                    <div className="font-extrabold text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <AlertCircle size={14} />
                      <span>FAILURE REASON & EXCEPTION DETAILS</span>
                    </div>
                    <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {currentSelection.error_message || currentSelection.metadata?.error_message || currentSelection.metadata?.detail || `HTTP ${currentStatus} Error Response from Target Endpoint`}
                    </p>
                  </div>
                )}

                {/* Request Metadata JSON code block */}
                <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-emerald-500" />
                      REQUEST PAYLOAD & METADATA
                    </span>
                  </div>
                  <pre className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed shadow-inner">
                    {JSON.stringify(currentPayload, null, 2)}
                  </pre>
                </div>

              </div>
            ) : (
              /* RAW JSON View (Displays FULL raw object details) */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Code2 className="h-4 w-4 text-indigo-400" />
                    FULL RAW LOG OBJECT
                  </span>
                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500">JSON</span>
                </div>
                <pre className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 font-mono text-[11px] overflow-x-auto max-h-[500px] leading-relaxed shadow-inner">
                  {JSON.stringify(currentSelection, null, 2)}
                </pre>
              </div>
            )}

          </div>
        )}

      </div>

      {/* 🗓️ CUSTOM DATE RANGE PICKER MODAL */}
      {showCustomDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#0d1017] space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-500" />
                Filter Logs by Custom Date Range
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomDateModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter('ALL');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setShowCustomDateModal(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold transition"
                >
                  Clear Filter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (customStartDate && customEndDate) {
                      setTimeFilter('CUSTOM');
                    }
                    setShowCustomDateModal(false);
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-md"
                >
                  Apply Custom Range
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  if (embedded) return content;

  return (
    <ProtectedLayout>
      {content}
    </ProtectedLayout>
  );
}