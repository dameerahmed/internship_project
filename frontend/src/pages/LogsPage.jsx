import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Virtuoso } from 'react-virtuoso';
import { 
  Search,
  RefreshCw,
  Clock,
  X,
  Database,
  Calendar,
  Download,
  Eye,
  Terminal
} from 'lucide-react';
import apiClient from '@/api/client';
import { API_ENDPOINTS, WS_ENDPOINTS } from '@/utils/constants';

// We'll bring in Sidebar to maintain app navigation
import Sidebar from '../components/Sidebar';

const statusBadgeStyle = (statusCode) => {
  if (!statusCode) return 'bg-gray-100 text-gray-500 border border-gray-200';
  if (statusCode >= 500) return 'bg-red-50 text-red-600 border border-red-100';
  if (statusCode >= 400) return 'bg-orange-50 text-orange-600 border border-orange-100';
  if (statusCode >= 300) return 'bg-amber-50 text-amber-600 border border-amber-100';
  return 'bg-gray-50 text-gray-600 border border-gray-200'; // 200 is gray in supabase
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

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => urlProjectId || sessionStorage.getItem('selectedProjectId') || null);
  
  // Controls & Filters
  const [polling, setPolling] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [showChart, setShowChart] = useState(true);
  const [page, setPage] = useState(1);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const MAX_ITEMS = 500;
  
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

  // Initial logs fetch
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
        if (customRange.start) {
          params.push(`start=${encodeURIComponent(new Date(customRange.start).toISOString())}`);
        }
        if (customRange.end) {
          params.push(`end=${encodeURIComponent(new Date(customRange.end).toISOString())}`);
        }
        
        const queryString = `?${params.join('&')}`;
        const { data } = await apiClient.get(API_ENDPOINTS.WEBHOOKS.LOGS(selectedProjectId) + queryString);
        
        if (!cancelled) {
          const normalized = (Array.isArray(data) ? data : []).slice(0, MAX_ITEMS);
          setLogs(normalized);
        }
      } catch {
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLogs();
    return () => { cancelled = true; };
  }, [selectedProjectId, page, statusFilter, customRange.start, customRange.end]);

  // Production-grade WebSocket Live Stream
  useEffect(() => {
    if (!selectedProjectId || !polling) return undefined;

    let ws = null;
    let isCancelled = false;
    let reconnectTimeout = null;

    const connectWs = () => {
      if (isCancelled) return;
      
      const wsUrl = WS_ENDPOINTS.LOGS(selectedProjectId);
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const newLog = JSON.parse(event.data);
          
          setLogs((prev) => {
            if (prev.some(p => p.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, MAX_ITEMS);
          });
        } catch (err) {
          // Silent parse error
        }
      };

      ws.onclose = () => {
        if (!isCancelled && polling) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      };
      
      ws.onerror = () => {
        if (ws) ws.close();
      };
    };

    connectWs();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [selectedProjectId, polling]);

  // Filter logs by search query and method
  const filteredLogs = useMemo(() => {
    let result = logs;

    if (methodFilter !== 'ALL') {
      result = result.filter(log => (log.metadata?.http_method || 'POST').toUpperCase() === methodFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((log) => {
        const logId = String(log.id || '').toLowerCase();
        const status = String(log.metadata?.response_code || '').toLowerCase();
        const path = String(log.metadata?.target_url || '').toLowerCase();
        return logId.includes(q) || status.includes(q) || path.includes(q);
      });
    }

    return result;
  }, [logs, searchQuery, methodFilter]);

  // Dynamic Histogram Data based on logs
  const histogramData = useMemo(() => {
    if (!logs || logs.length === 0) return { buckets: [], minLabel: '', maxLabel: '' };
    
    const times = logs.map(l => new Date(l.timestamp).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times) || Date.now();
    
    const formatLabel = (ms) => {
      const d = new Date(ms);
      return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    };

    const BUCKETS = 60; // More dense bars like Supabase
    const timeRange = maxTime - minTime;
    const bucketSize = timeRange / BUCKETS || 1000;
    
    const buckets = Array(BUCKETS).fill(0);
    logs.forEach(log => {
      const t = new Date(log.timestamp).getTime();
      let index = Math.floor((t - minTime) / bucketSize);
      if (index >= BUCKETS) index = BUCKETS - 1;
      buckets[index]++;
    });
    
    const maxVal = Math.max(...buckets) || 1;
    
    return {
      buckets: buckets.map((count, i) => ({
        id: i,
        value: (count / maxVal) * 100,
        count
      })),
      minLabel: formatLabel(minTime),
      maxLabel: formatLabel(maxTime)
    };
  }, [logs]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Inspector Data Formatter
  const inspectorData = useMemo(() => {
    if (!activeLog) return null;
    const metadata = activeLog.metadata || {};
    
    const rawHeaders = metadata.incoming_headers || metadata.headers || {
      "Content-Type": "application/json",
      "User-Agent": "Webhook-Gateway/2.0",
    };
    const headers = sanitizeHeaders(rawHeaders);

    const payload = metadata.request_payload || metadata.event_payload || metadata.payload || {
      "event": metadata.event_type || "webhook.received",
      "log_id": activeLog.id,
    };

    return { headers, payload, metadata };
  }, [activeLog]);

  // Handle Download JSON
  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `webhook_logs_${selectedProjectId || 'export'}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Virtuoso row renderer
  const renderRow = useCallback((index, log) => {
    const statusCode = log.metadata?.response_code;
    const method = log.metadata?.http_method || 'POST';
    const path = log.metadata?.target_url || '/v1/webhook';
    const isSelected = activeLog?.id === log.id;
    
    // Format timestamp: "23 Oct 17:49:18"
    const date = new Date(log.timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const time = date.toLocaleTimeString('en-GB'); // 24hr format HH:MM:SS
    const timeString = `${day} ${month} ${time}`;

    return (
      <div 
        onClick={() => setActiveLog(log)}
        className={`flex items-center gap-4 px-4 py-1.5 text-[12px] font-mono cursor-pointer border-b border-gray-100 transition-colors ${
          isSelected ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
        }`}
      >
        <div className="w-36 text-gray-500 whitespace-nowrap">{timeString}</div>
        <div className="w-14">
          <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${statusBadgeStyle(statusCode)}`}>
            {statusCode || '200'}
          </span>
        </div>
        <div className="w-12 text-gray-700">{method}</div>
        <div className="flex-1 truncate text-gray-600">{path}</div>
      </div>
    );
  }, [activeLog]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        
        {/* Logs List Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          
          {/* Secondary Filter Bar - Exact match to image */}
          <div className="flex items-center p-3 border-b border-gray-200 shrink-0 flex-wrap gap-2 text-[13px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search events" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50/50 border border-gray-200 rounded text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 transition"
              />
            </div>
            
            {/* Refresh */}
            <button 
              onClick={() => setPolling(!polling)}
              className="p-1.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition bg-white"
              title={polling ? "Pause Live Stream" : "Resume Live Stream"}
            >
              <RefreshCw size={14} className={polling ? "animate-spin text-green-600" : ""} />
            </button>
            
            {/* Last 24 hours / Live */}
            <button 
              onClick={() => {
                setCustomRange({ start: '', end: '' });
                setPolling(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition ${!customRange.start && !customRange.end ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <Clock size={13} className={!customRange.start && !customRange.end ? '' : 'text-gray-500'} />
              Live
            </button>

            {/* Custom Date Range Popover */}
            <div className="relative">
              <button 
                onClick={() => setShowDatePicker(!showDatePicker)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded transition ${customRange.start || customRange.end ? 'bg-gray-900 text-white hover:bg-gray-800 font-medium' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                <Calendar size={13} className={customRange.start || customRange.end ? '' : 'text-gray-500'} />
                Custom
              </button>

              {showDatePicker && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-xl rounded-md p-3 z-50 flex flex-col gap-3 w-56 text-[12px]">
                  <div>
                    <label className="block text-gray-500 font-medium mb-1.5">Start Date & Time</label>
                    <input 
                      type="datetime-local" 
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400"
                      value={customRange.start}
                      onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 font-medium mb-1.5">End Date & Time</label>
                    <input 
                      type="datetime-local" 
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400"
                      value={customRange.end}
                      onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-between mt-1 pt-2 border-t border-gray-100">
                    <button 
                      onClick={() => { setCustomRange({start:'', end:''}); setShowDatePicker(false); setPolling(true); }}
                      className="text-gray-500 hover:text-gray-900 font-medium px-2 py-1"
                    >Reset</button>
                    <button 
                      onClick={() => { setShowDatePicker(false); setPolling(false); }} 
                      className="bg-gray-900 text-white px-3 py-1 rounded font-medium hover:bg-gray-800"
                    >Apply Range</button>
                  </div>
                </div>
              )}
            </div>

            {/* Status Dropdown */}
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition cursor-pointer outline-none appearance-none font-medium"
            >
              <option value="ALL">Status</option>
              <option value="2XX">2XX Success</option>
              <option value="4XX">4XX Error</option>
              <option value="5XX">5XX Error</option>
            </select>

            {/* Product Dropdown (Dummy for aesthetics) */}
            <select className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition cursor-pointer outline-none appearance-none font-medium">
              <option>Product</option>
            </select>

            {/* Method Dropdown */}
            <select 
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition cursor-pointer outline-none appearance-none font-medium"
            >
              <option value="ALL">Method</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
            
            {/* Chart Toggle */}
            <button 
              onClick={() => setShowChart(!showChart)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition ${showChart ? 'bg-gray-100 font-medium' : 'bg-white font-medium'}`}
            >
              <Eye size={14} className="text-gray-500" />
              Chart
            </button>
            
            {/* Download */}
            <button 
              onClick={handleDownload}
              className="p-1.5 bg-white border border-gray-200 text-gray-600 rounded hover:bg-gray-50 transition"
              title="Download JSON"
            >
              <Download size={14} />
            </button>

            <div className="flex-1" /> {/* Spacer */}

            {/* Terminal Button */}
            <button className="p-1.5 bg-white border border-gray-200 text-gray-600 rounded hover:bg-gray-50 transition">
              <Terminal size={14} />
            </button>

            {/* Source Database (Dummy for aesthetics) */}
            <select className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded hover:bg-gray-50 transition cursor-pointer outline-none appearance-none font-medium text-xs flex items-center">
              <option>source Primary Database</option>
            </select>
          </div>

          {/* Dynamic Histogram (Supabase exact style) */}
          {showChart && (
            <div className="h-32 border-b border-gray-200 flex flex-col px-4 pt-3 pb-1 shrink-0 bg-white">
              <div className="text-[11px] text-gray-500 font-medium mb-3 flex justify-between">
                <span>Logs / Time</span>
              </div>
              
              <div className="flex-1 flex flex-col justify-end relative">
                {logs.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                    Waiting for data...
                  </div>
                ) : (
                  <>
                    <div className="flex-1 flex items-end justify-between gap-[2px] z-10 border-b border-gray-200 pb-1">
                      {histogramData.buckets.map((d, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 transition-colors rounded-sm relative group cursor-crosshair min-h-[2px]" 
                          style={{ height: `${Math.max(d.value, 4)}%` }} // min height for visibility
                        >
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-50">
                            {d.count} events
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Time labels below chart */}
                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                      <span>{histogramData.minLabel}</span>
                      <span>{histogramData.maxLabel}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Virtualized Table */}
          <div className="flex-1 relative bg-white">
            {loading && logs.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center text-gray-400 gap-2">
                  <RefreshCw size={24} className="animate-spin text-gray-400" />
                  <span className="text-sm">Loading logs...</span>
                </div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <Database size={32} className="mb-2 opacity-30 text-gray-300" />
                <span className="text-sm font-medium text-gray-600">No logs found</span>
                <span className="text-xs">Adjust your filters to see more events</span>
              </div>
            ) : (
              <Virtuoso
                data={filteredLogs}
                itemContent={renderRow}
                className="h-full scrollbar-thin"
              />
            )}
          </div>
        </div>

        {/* Right Panel Inspector */}
        {activeLog && (
          <div className="w-[450px] border-l border-gray-200 bg-white flex flex-col shrink-0 shadow-[-4px_0_15px_rgba(0,0,0,0.03)] z-10">
            {/* Panel Header (Tabs) */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 pt-3 h-12 bg-white">
              <div className="flex gap-6 h-full">
                <button 
                  onClick={() => setActiveTab('details')}
                  className={`h-full text-[13px] font-medium border-b-2 transition-colors ${
                    activeTab === 'details' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Details
                </button>
                <button 
                  onClick={() => setActiveTab('raw')}
                  className={`h-full text-[13px] font-medium border-b-2 transition-colors ${
                    activeTab === 'raw' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Raw
                </button>
              </div>
              <button onClick={() => setActiveLog(null)} className="text-gray-400 hover:text-gray-600 mb-2">
                <X size={14} />
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-6 text-[13px]">
              {activeTab === 'details' ? (
                <div className="space-y-6">
                  {/* Status & Basic Info */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-[100px_1fr] items-center text-gray-500">
                      <span>Status</span>
                      <div>
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium inline-block border ${statusBadgeStyle(activeLog.metadata?.response_code)}`}>
                          {activeLog.metadata?.response_code || '200'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-[100px_1fr] text-gray-500">
                      <span>Method</span>
                      <span className="font-mono text-gray-800 text-[12px]">{activeLog.metadata?.http_method || 'POST'}</span>
                    </div>
                    
                    <div className="grid grid-cols-[100px_1fr] text-gray-500">
                      <span>Timestamp</span>
                      <span className="font-mono text-gray-800 text-[12px]">{new Date(activeLog.timestamp).toISOString()}</span>
                    </div>
                    
                    <div className="grid grid-cols-[100px_1fr] text-gray-500">
                      <span>IP Address</span>
                      <span className="font-mono text-gray-800 text-[12px]">{activeLog.metadata?.source_ip || '168.228.27.74'}</span>
                    </div>
                    
                    <div className="grid grid-cols-[100px_1fr] text-gray-500">
                      <span>Origin Country</span>
                      <span className="font-mono text-gray-800 text-[12px]">BR</span>
                    </div>
                    
                    <div className="grid grid-cols-[100px_1fr] text-gray-500">
                      <span>Referer</span>
                      <span className="font-mono text-gray-800 text-[12px]">{activeLog.metadata?.target_url || 'https://supabase.com/'}</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-6">
                    <h4 className="text-[11px] font-medium text-gray-400 tracking-widest uppercase mb-4">Request Metadata</h4>
                    <pre className="text-[12px] font-mono text-gray-600 bg-gray-50/50 p-4 rounded-md overflow-x-auto border border-gray-100">
                      {JSON.stringify(inspectorData?.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-[11px] font-medium text-gray-400 tracking-widest uppercase">Raw JSON</h4>
                  <pre className="text-[12px] font-mono text-gray-600 bg-gray-50/50 p-4 rounded-md overflow-x-auto border border-gray-100">
                    {JSON.stringify(activeLog, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}