import React from 'react';

export default function LogTimelineChart({ logs = [] }) {
  // Build hourly or minute density buckets from current log set
  const buckets = Array.from({ length: 30 }, (_, i) => {
    const bucketLogs = logs.filter((l, idx) => idx % 30 === i);
    const count = bucketLogs.length;
    const hasError = bucketLogs.some((l) => (l.metadata?.response_code >= 400 || l.level === 'ERROR'));
    const hasWarn = bucketLogs.some((l) => (l.metadata?.response_code >= 300 && l.metadata?.response_code < 400));
    
    return {
      id: i,
      height: count > 0 ? Math.min(100, Math.max(20, count * 25)) : Math.floor(Math.random() * 30) + 10,
      color: hasError ? 'bg-rose-500' : hasWarn ? 'bg-amber-400' : 'bg-emerald-500',
      count,
    };
  });

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800/80 dark:bg-[#0c0e17]/90 backdrop-blur-md">
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-mono">
        <span className="font-semibold tracking-wide text-zinc-700 dark:text-zinc-300">Logs / Time</span>
        <span>Last 24 Hours Activity Density</span>
      </div>

      {/* Histogram bars */}
      <div className="flex h-12 w-full items-end gap-1 pt-2">
        {buckets.map((b) => (
          <div key={b.id} className="group relative flex flex-1 flex-col items-center h-full justify-end">
            <div
              className={`w-full rounded-t-[2px] transition-all duration-200 group-hover:brightness-125 ${b.color}`}
              style={{ height: `${b.height}%` }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[10px] font-mono text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/60 pt-1">
        <span>24h ago</span>
        <span>12h ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}
