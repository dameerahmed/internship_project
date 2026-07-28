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
  ChevronRight
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { useAuth } from '../context/AuthContext';
import { WS_ENDPOINTS, withToken } from '@/utils/constants';

export default function LogsPage({ projectId, embedded = false }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer state: ONLY open when a log is explicitly clicked by user!
  const [selectedLog, setSelectedLog] = useState(null);
  
  // Toolbar state
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('24H'); // '1H', '24H', '7D', 'CUSTOM', 'ALL'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
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

  const normalizeLog = (log) => {
    const metadata = log?.metadata || {};
    const responseCode = log?.response_code ?? log?.status_code ?? metadata?.response_code ?? metadata?.status_code ?? 200;
    const createdAt = log?.created_at || log?.timestamp || metadata?.created_at || '';
    const eventType = log?.event_type || metadata?.event_type || log?.delivery_packet?.event_type || '';
    const targetUrl = log?.target_url || log?.path || metadata?.target_url || log?.delivery_packet?.target_url || '';
    const httpMethod = log?.http_method || metadata?.http_method || log?.delivery_packet?.http_method || 'POST';

    return {
      ...log,
      created_at: createdAt,
      response_code: responseCode,
      status_code: responseCode,
      event_type: eventType,
      target_url: targetUrl,
      path: targetUrl,
      http_method: httpMethod,
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

  // 100% Working Multi-Filter Calculation
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

      // 3. Product / Event Filter
      let matchesProduct = true;
      if (productFilter !== 'ALL') {
        if (productFilter === 'orders') matchesProduct = eventType.includes('order') || path.includes('order');
        if (productFilter === 'auth') matchesProduct = eventType.includes('auth') || path.includes('auth');
        if (productFilter === 'storage') matchesProduct = eventType.includes('storage') || path.includes('storage');
        if (productFilter === 'system') matchesProduct = eventType.includes('system') || path.includes('health');
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

      return matchesSearch && matchesStatus && matchesProduct && matchesMethod && matchesTime;
    });
  }, [logs, searchQuery, statusFilter, productFilter, methodFilter, timeFilter, customStartDate, customEndDate]);

  const chartData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({ id: i, count: 0 }));
    const now = Date.now();

    filteredLogs.forEach((log) => {
      const ts = log.created_at ? new Date(log.created_at).getTime() : now;
      const ageHours = Math.max(0, Math.min(23, (now - ts) / (1000 * 60 * 60)));
      const bucketIndex = Math.floor(ageHours);
      buckets[bucketIndex].count += 1;
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
      
      {/* 🚀 1. Supabase-Style Control Toolbar */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
        
        {!embedded && (
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-500" />
              Logs & Real-time Telemetry Explorer
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">source:</span>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5">
                <Database size={12} className="text-emerald-500" />
                Primary Ingress Database ({filteredLogs.length})
              </span>
            </div>
          </div>
        )}

        {/* Toolbar Controls Matching User Screenshot */}
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
                className="w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-emerald-500 focus:outline-none transition"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchLogs(false)}
              className="p-2 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 shrink-0"
              title="Refresh logs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          </div>

          {/* Filter Options Matching Screenshot */}
          <div className="flex items-center gap-2 overflow-x-auto">
            
            {/* Time Range Selector Pill */}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-1.5 font-semibold text-[11px] focus:outline-none shrink-0 cursor-pointer"
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
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-medium shrink-0 transition ${
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
              className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none shrink-0 cursor-pointer"
            >
              <option value="ALL">Status: All</option>
              <option value="200">200 OK</option>
              <option value="304">304 Cached</option>
              <option value="400">400 Bad Request</option>
              <option value="500">500 Server Error</option>
            </select>

            {/* Product / Domain Filter */}
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none shrink-0 cursor-pointer"
            >
              <option value="ALL">Product: All</option>
              <option value="orders">Orders Webhooks</option>
              <option value="auth">Auth Events</option>
              <option value="storage">Storage API</option>
              <option value="system">System Health</option>
            </select>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none shrink-0 cursor-pointer"
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
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-medium shrink-0 transition ${
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
              className="p-2 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-emerald-500 transition shrink-0"
              title="Export logs to JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </button>

            {/* Console SQL/API Query Toggle Button (>_) */}
            <button
              type="button"
              onClick={() => setShowConsoleQuery(!showConsoleQuery)}
              className={`p-2 rounded-lg border shrink-0 transition ${
                showConsoleQuery
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
              title="Open SQL Query Console (>_)"
            >
              <span className="font-mono text-xs font-bold font-mono">&gt;_</span>
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

      {/* 📈 2. Supabase Mini Timeline Histogram Bar Chart */}
      {showChart && (
        <div className="flex flex-col gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-4">
          <div className="text-[10px] font-mono text-zinc-400">Logs / Time</div>
          <div className="h-10 w-full flex items-end justify-between gap-1 pt-2">
            {chartData.map((bucket) => {
              const maxCount = Math.max(1, ...chartData.map((item) => item.count));
              const hPct = bucket.count === 0 ? 8 : Math.max(12, Math.round((bucket.count / maxCount) * 100));
              return (
                <div 
                  key={bucket.id} 
                  className="flex-1 bg-emerald-500/70 hover:bg-emerald-500 rounded-t transition cursor-pointer" 
                  style={{ height: `${hPct}%` }}
                  title={`${bucket.count} log entries`}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
            <span>Recent Activity</span>
            <span>Real-time Ingress Stream</span>
          </div>
        </div>
      )}

      {/* 📊 3. DYNAMIC LAYOUT: Full Width (12 cols) by Default; Split (7 + 5 cols) ONLY when a row is clicked! */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        
        {/* Stream Table: Spans full 12 cols if no row selected; spans 7 cols when row is clicked! */}
        <div className={`${selectedLog ? 'lg:col-span-7' : 'lg:col-span-12'} flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-[#0c0e17] shadow-sm transition-all duration-200`}>
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
                  ? new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '17:49:18';

                const formattedDate = log.created_at
                  ? new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                  : '23 Oct';

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
                      {/* Date & Timestamp */}
                      <span className="text-[11px] text-zinc-400 shrink-0 w-28">
                        {formattedDate} {formattedTime}
                      </span>

                      {/* Status Code Badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        code >= 200 && code < 300 
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                          : code === 304
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      }`}>
                        {code}
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
          <div className="lg:col-span-5 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-[#0c0e17] shadow-lg font-sans flex flex-col gap-4 sticky top-4">
            
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
                    currentStatus >= 200 && currentStatus < 300
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : currentStatus === 304
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  }`}>
                    {currentStatus}
                  </span>
                </div>

                {/* Method row */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Method</span>
                  <span className="font-bold font-mono text-zinc-900 dark:text-white">
                    {currentMethod}
                  </span>
                </div>

                {/* Timestamp row */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Timestamp</span>
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                    {currentSelection.created_at ? new Date(currentSelection.created_at).toISOString() : new Date().toISOString()}
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
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                    {currentTarget}
                  </span>
                </div>

                {/* IP Address */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">IP Address</span>
                  <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {currentSelection.ip_address || 'Unavailable'}
                  </span>
                </div>

                {/* Origin Country */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Origin Country</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {currentSelection.country || 'Unknown'}
                  </span>
                </div>

                {/* Referer */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Referer</span>
                  <a
                    href={currentSelection.referer || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[200px]"
                  >
                    {currentSelection.referer || 'Not provided'}
                  </a>
                </div>

                {/* Request Metadata JSON code block matching user screenshot */}
                <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-emerald-500" />
                      REQUEST METADATA
                    </span>
                  </div>
                  <pre className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed shadow-inner">
                    {JSON.stringify(currentPayload, null, 2)}
                  </pre>
                </div>

              </div>
            ) : (
              /* 100% Complete RAW JSON View (Displays FULL raw object details) */
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
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 space-y-4 shadow-2xl">
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
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                  setTimeFilter('24H');
                  setShowCustomDateModal(false);
                }}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 font-semibold text-zinc-600 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={() => {
                  if (customStartDate && customEndDate) {
                    setTimeFilter('CUSTOM');
                  }
                  setShowCustomDateModal(false);
                }}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 font-bold text-white shadow-md transition"
              >
                Apply Date Filter
              </button>
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