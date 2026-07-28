import React from 'react';

export default function LogTimelineChart({ logs = [] }) {
  const buckets = Array.from({ length: 24 }, (_, i) => ({ id: i, count: 0, color: 'bg-emerald-500' }));
  const now = Date.now();

  logs.forEach((log) => {
    const ts = log.created_at ? new Date(log.created_at).getTime() : now;
    const ageHours = Math.max(0, Math.min(23, (now - ts) / (1000 * 60 * 60)));
    const bucketIndex = Math.floor(ageHours);
    buckets[bucketIndex].count += 1;
  });

  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const normalizedBuckets = buckets.map((bucket) => {
    const hasError = logs.some((log) => (log.response_code >= 400 || log.status === 'FAILED'));
    const hasWarn = logs.some((log) => (log.response_code >= 300 && log.response_code < 400));
    const height = bucket.count === 0 ? 6 : Math.max(12, Math.round((bucket.count / maxCount) * 100));
    return {
      ...bucket,
      height,
      color: hasError ? 'bg-rose-500' : hasWarn ? 'bg-amber-400' : 'bg-emerald-500',
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
        {normalizedBuckets.map((b) => (
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
