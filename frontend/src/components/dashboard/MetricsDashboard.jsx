import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Check, X, Server, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '@/api/client';
import { API_ENDPOINTS, WS_ENDPOINTS } from '@/utils/constants';

const EMPTY_STATS = {
  total_webhooks: 0,
  success_count: 0,
  failed_count: 0,
  throughput_rpm: 0,
  throughput_rps: 0.0,
  success_rate: 100.0,
  avg_latency_ms: 0.0,
  dlq_count: 0,
  main_queue_count: 0,
  redis_status: 'CHECKING',
  redis_latency_ms: 0.0,
  rabbitmq_status: 'CHECKING',
};

// Mini Sparkline component
function Sparkline({ color = '#10b981', reverse = false, data = [] }) {
  if (data.length < 2) return <div className="h-4 w-16" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const height = 16;
  const width = 64;
  
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    let y = height - ((val - min) / (max - min || 1)) * height;
    if (reverse) y = height - y;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="overflow-visible" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={width} cy={points[points.length-1].split(',')[1]} r="2" fill={color} />
    </svg>
  );
}

// Stacked Bar Chart component (CSS based for performance)
function HourlyActivityChart({ history }) {
  const BARS = 40;
  
  // Pad history to 40 items
  const padded = [...history];
  while(padded.length < BARS) padded.unshift({ s: 0, f: 0, p: 0 });
  const displayData = padded.slice(-BARS);

  const maxTotal = Math.max(...displayData.map(d => d.s + d.f + d.p), 10); // Minimum scale 10

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-[15px] font-semibold text-gray-900">Live Activity</h3>
      </div>
      
      <div className="h-48 flex items-end justify-between gap-1 border-b border-gray-100 pb-2 relative group">
        
        {/* Tooltip on hover */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-xl rounded-lg p-3 hidden group-hover:block z-50 w-48 transition-opacity">
           <div className="flex justify-between items-center text-xs mb-2">
             <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"/>Successful</span>
             <span className="font-semibold">{displayData[displayData.length-1]?.s || 0}</span>
           </div>
           <div className="flex justify-between items-center text-xs mb-2">
             <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"/>Pending</span>
             <span className="font-semibold">{displayData[displayData.length-1]?.p || 0}</span>
           </div>
           <div className="flex justify-between items-center text-xs mb-2">
             <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"/>Failed</span>
             <span className="font-semibold">{displayData[displayData.length-1]?.f || 0}</span>
           </div>
           <div className="text-[10px] text-center text-gray-400 mt-2 pt-2 border-t border-gray-100">Live RPS Data</div>
        </div>

        {displayData.map((d, i) => {
          const sHeight = (d.s / maxTotal) * 100;
          const fHeight = (d.f / maxTotal) * 100;
          const pHeight = (d.p / maxTotal) * 100;
          
          return (
            <div key={i} className="flex-1 flex flex-col justify-end gap-[1px] group-hover:opacity-80 hover:!opacity-100 transition-opacity">
              {fHeight > 0 && <div className="w-full bg-red-500 rounded-sm" style={{ height: `${fHeight}%`, minHeight: '2px' }} />}
              {pHeight > 0 && <div className="w-full bg-amber-400 rounded-sm" style={{ height: `${pHeight}%`, minHeight: '2px' }} />}
              {sHeight > 0 && <div className="w-full bg-green-500 rounded-sm" style={{ height: `${sHeight}%`, minHeight: '2px' }} />}
            </div>
          );
        })}
      </div>
      
      <div className="flex justify-between mt-3 text-[11px] text-gray-400 font-medium">
        <span>-60s</span>
        <span>-45s</span>
        <span>-30s</span>
        <span>-15s</span>
        <span>Now</span>
      </div>
    </div>
  );
}

export default function MetricsDashboard({ companyId }) {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [projects, setProjects] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [historyData, setHistoryData] = useState(() => Array(40).fill({ s: 0, f: 0, p: 0 }));

  // Sparkline histories
  const [sparkTotal, setSparkTotal] = useState(() => Array(10).fill(0));
  const [sparkSucc, setSparkSucc] = useState(() => Array(10).fill(0));
  const [sparkFail, setSparkFail] = useState(() => Array(10).fill(0));

  // --- DECOUPLED RENDER LOOP (Anti-Hang Optimization) ---
  const latestStatsRef = useRef(EMPTY_STATS);
  
  useEffect(() => {
    // This interval updates the React state ONCE per second, no matter how fast the WS pumps data.
    const renderInterval = setInterval(() => {
      const current = latestStatsRef.current;
      setStats(current);
      
      // Update sparklines safely
      setSparkTotal(prev => [...prev.slice(1), current.total_webhooks]);
      setSparkSucc(prev => [...prev.slice(1), current.success_count]);
      setSparkFail(prev => [...prev.slice(1), current.failed_count]);

      // Update stacked bar history based on RPS
      setHistoryData(prev => {
        // Approximate a split based on total success/fail ratios
        const total = current.success_count + current.failed_count || 1;
        const sRatio = current.success_count / total;
        const fRatio = current.failed_count / total;
        const rps = current.throughput_rps || 0;
        
        return [...prev.slice(1), { 
          s: Math.round(rps * sRatio), 
          f: Math.round(rps * fRatio), 
          p: Math.min(rps * 0.1, current.main_queue_count) // Fake pending for visual
        }];
      });
    }, 1000);

    return () => clearInterval(renderInterval);
  }, []);

  // 1. Initial HTTP Data Load (Runs ONCE)
  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      try {
        const [statsRes, projectsRes] = await Promise.allSettled([
          apiClient.get('/v1/dashboard/stats'),
          apiClient.get(API_ENDPOINTS.PROJECTS.LIST),
        ]);

        if (cancelled) return;

        if (statsRes.status === 'fulfilled' && statsRes.value?.data) {
          latestStatsRef.current = statsRes.value.data;
          setStats(statsRes.value.data); // Force initial render
        }

        if (projectsRes.status === 'fulfilled' && Array.isArray(projectsRes.value?.data)) {
          const allProjects = projectsRes.value.data;
          setProjects(allProjects.slice(0, 5));
          
          if (allProjects[0]?.id) {
            try {
              const logsRes = await apiClient.get(`/v1/projects/${allProjects[0].id}/webhook-logs?limit=8`);
              if (!cancelled && Array.isArray(logsRes.data)) {
                setRecentLogs(logsRes.data.slice(0, 8));
              }
            } catch { /* silent */ }
          }
        }
      } catch { /* silent */ }
    };

    loadInitialData();
    return () => { cancelled = true; };
  }, []);

  // 2. Production WebSocket for Dashboard Stats (Writes to Ref, NOT State)
  useEffect(() => {
    if (!companyId) return undefined;

    let ws = null;
    let reconnectTimer = null;
    let isCancelled = false;

    const connectWS = () => {
      if (isCancelled) return;
      ws = new WebSocket(WS_ENDPOINTS.DASHBOARD(companyId));
      
      ws.onmessage = (evt) => {
        if (isCancelled) return;
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'DASHBOARD_UPDATE') {
            // ONLY UPDATE REF! Prevents React from hanging.
            latestStatsRef.current = msg;
          }
        } catch { /* ignore */ }
      };
      
      ws.onclose = () => {
        if (!isCancelled) reconnectTimer = setTimeout(connectWS, 3000);
      };
      ws.onerror = () => { if (ws) ws.close(); };
    };

    connectWS();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [companyId]);

  // 3. Production WebSocket for Recent Logs
  useEffect(() => {
    const defaultProject = projects[0];
    if (!defaultProject?.id) return undefined;

    let ws = null;
    let reconnectTimer = null;
    let isCancelled = false;

    const connectWS = () => {
      if (isCancelled) return;
      ws = new WebSocket(WS_ENDPOINTS.LOGS(defaultProject.id));

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const newLog = JSON.parse(event.data);
          // For logs, we update state directly since they are low-volume compared to stats updates, 
          // but we can throttle if needed. React batches these well.
          setRecentLogs((prev) => {
            if (prev.some(p => p.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, 8);
          });
        } catch (err) {}
      };

      ws.onclose = () => {
        if (!isCancelled) reconnectTimer = setTimeout(connectWS, 3000);
      };
      ws.onerror = () => { if (ws) ws.close(); };
    };

    connectWS();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [projects]);


  return (
    <div className="flex flex-col gap-10">
      
      {/* --- TOP METRICS ROW (Thirdweb Style) --- */}
      <div className="grid grid-cols-5 gap-6 border-b border-gray-100 pb-8">
        
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-gray-500 mb-2">Total Webhooks Sent</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">{stats.total_webhooks.toLocaleString()}</span>
            <div className="mb-1"><Sparkline data={sparkTotal} color="#10b981" /></div>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-gray-500 mb-2">Successful</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">{stats.success_count.toLocaleString()}</span>
            <div className="mb-1"><Sparkline data={sparkSucc} color="#10b981" /></div>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-gray-500 mb-2">Failed</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">{stats.failed_count.toLocaleString()}</span>
            <div className="mb-1"><Sparkline data={sparkFail} color="#ef4444" /></div>
          </div>
        </div>

        <div className="flex flex-col border-l border-gray-100 pl-6">
          <span className="text-[13px] font-semibold text-gray-500 mb-2">Main Queue (Pending)</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">{stats.main_queue_count.toLocaleString()}</span>
            <div className="mb-1"><Sparkline data={Array(10).fill(stats.main_queue_count)} color="#f59e0b" /></div>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-gray-500 mb-2 text-red-500">Dead Letter Queue</span>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">{stats.dlq_count.toLocaleString()}</span>
            <div className="mb-1"><Sparkline data={Array(10).fill(stats.dlq_count)} color="#ef4444" /></div>
          </div>
        </div>

      </div>

      {/* --- MAIN SPLIT LAYOUT --- */}
      <div className="grid grid-cols-[1fr_400px] gap-12">
        
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-10">
          
          <HourlyActivityChart history={historyData} />

          {/* Latency & Infra panel */}
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900 mb-6">Infrastructure Latency</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500 mb-1">Average Response</span>
                <span className="text-xl font-bold text-gray-900 tracking-tight">{stats.avg_latency_ms} ms</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500 mb-1">Redis Ping</span>
                <span className="text-xl font-bold text-gray-900 tracking-tight">{stats.redis_latency_ms} ms</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500 mb-1">RabbitMQ Status</span>
                <span className="text-xl font-bold text-emerald-600 tracking-tight">{stats.rabbitmq_status}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500 mb-1">Redis Status</span>
                <span className="text-xl font-bold text-emerald-600 tracking-tight">{stats.redis_status}</span>
              </div>
            </div>
          </div>
          
          {/* Setup Summary */}
          <div className="mt-4 pt-8 border-t border-gray-100">
             <h3 className="text-[15px] font-semibold text-gray-900 mb-6">Setup Summary</h3>
             <div className="grid grid-cols-2 gap-4">
               <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Total Webhooks Sent</span>
                  <span className="text-xl font-bold text-gray-900">{stats.total_webhooks.toLocaleString()}</span>
               </div>
               <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Total Events Subscribed</span>
                  <span className="text-xl font-bold text-gray-900">{stats.total_event_routes}</span>
               </div>
             </div>
          </div>

        </div>


        {/* RIGHT COLUMN */}
        <div className="flex flex-col pl-8 border-l border-gray-100">
          <h3 className="text-[15px] font-semibold text-gray-900 mb-6">Recent Queue</h3>
          
          {/* Table Header */}
          <div className="grid grid-cols-[100px_1fr_1fr] text-xs font-medium text-gray-400 mb-4 px-2">
            <div>Response Code</div>
            <div>Event</div>
            <div>Target URL</div>
          </div>

          {/* Table Body */}
          <div className="flex flex-col gap-1">
            {recentLogs.map((log) => {
              const code = log.metadata?.response_code || 200;
              const isSuccess = code >= 200 && code < 300;
              
              return (
                <div key={log.id} className="grid grid-cols-[100px_1fr_1fr] items-center text-[13px] py-2 px-2 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-50 last:border-0">
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${isSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                      {isSuccess ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                      {code}
                    </span>
                  </div>
                  <div className="text-gray-700 font-medium truncate pr-4">
                    {log.metadata?.event_type || 'webhook.received'}
                  </div>
                  <div className="text-gray-400 truncate text-xs font-mono">
                    {log.metadata?.target_url?.replace(/^https?:\/\//, '') || 'gateway...'}
                  </div>
                </div>
              );
            })}
            
            {recentLogs.length === 0 && (
              <div className="text-sm text-gray-400 py-4 px-2">No recent events found.</div>
            )}
          </div>
          
          {/* Top Events Block */}
          <div className="mt-12 pt-8 border-t border-gray-100">
             <h3 className="text-[15px] font-semibold text-gray-900 mb-4">Top Events</h3>
             <div className="flex flex-col gap-3">
               <div className="text-sm text-gray-500 font-medium">order:created</div>
               <div className="text-sm text-gray-300 font-medium">api_key.created</div>
               <div className="text-sm text-gray-200 font-medium">order:cancelled:product</div>
             </div>
          </div>

        </div>

      </div>

    </div>
  );
}
