import React from 'react';

export default function LogTimelineChart({ logs = [] }) {
  const buckets = Array.from({ length: 24 }, (_, i) => ({ id: i, count: 0, success: 0, failed: 0 }));
  const now = Date.now();

  logs.forEach((log) => {
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

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800/80 dark:bg-[#0c0e17]/90 backdrop-blur-md">
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-mono">
        <span className="font-semibold tracking-wide text-zinc-700 dark:text-zinc-300">Logs / Time</span>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-emerald-500 font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Success
          </span>
          <span className="flex items-center gap-1 text-rose-500 font-bold">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Failed
          </span>
        </div>
      </div>

      {/* Histogram bars */}
      <div className="flex h-12 w-full items-end gap-1 pt-2">
        {buckets.map((b) => {
          const height = b.count === 0 ? 6 : Math.max(14, Math.round((b.count / maxCount) * 100));
          const failedPct = b.count > 0 ? (b.failed / b.count) * 100 : 0;
          const successPct = b.count > 0 ? (b.success / b.count) * 100 : 100;

          return (
            <div key={b.id} className="group relative flex flex-1 flex-col items-center h-full justify-end">
              <div
                className="w-full flex flex-col justify-end rounded-t-[2px] overflow-hidden transition-all duration-200 group-hover:brightness-125"
                style={{ height: `${height}%` }}
                title={`Total: ${b.count} (${b.success} success, ${b.failed} failed)`}
              >
                {b.count === 0 ? (
                  <div className="w-full h-full bg-zinc-200/50 dark:bg-zinc-800/40 rounded-t-[2px]" />
                ) : (
                  <>
                    {b.failed > 0 && (
                      <div className="w-full bg-rose-500 transition-all" style={{ height: `${failedPct}%` }} />
                    )}
                    {b.success > 0 && (
                      <div className="w-full bg-emerald-500 transition-all" style={{ height: `${b.failed > 0 ? successPct : 100}%` }} />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] font-mono text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/60 pt-1">
        <span>24h ago</span>
        <span>12h ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}
