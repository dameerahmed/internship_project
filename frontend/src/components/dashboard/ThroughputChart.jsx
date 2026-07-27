import React from 'react';

export default function ThroughputChart({ series = [], title = "24-Hour Webhook Throughput" }) {
  if (!series || series.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/50 p-6 text-gray-400">
        <p className="text-sm font-medium">No throughput activity recorded in the past 24 hours.</p>
      </div>
    );
  }

  const maxVal = Math.max(...series.map((s) => s.total || 0), 10);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900/70 p-6 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-200 tracking-wide">{title}</h3>
          <p className="text-xs text-gray-400">Real-time rolling hourly distribution across 24h window</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Success
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            Failure
          </span>
        </div>
      </div>

      <div className="h-48 w-full pt-4">
        <div className="flex h-36 items-end gap-1.5 sm:gap-2">
          {series.map((item, idx) => {
            const totalHeightPct = Math.min(100, Math.max(8, (item.total / maxVal) * 100));
            const successPct = item.total > 0 ? (item.success / item.total) * 100 : 100;
            const failPct = 100 - successPct;

            return (
              <div key={idx} className="group relative flex flex-1 flex-col items-center h-full justify-end">
                {/* Tooltip */}
                <div className="absolute -top-12 z-20 hidden flex-col items-center rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1 text-[10px] font-mono text-gray-200 shadow-xl group-hover:flex whitespace-nowrap">
                  <div><span className="font-bold text-gray-100">{item.label}</span> — Total: {item.total}</div>
                  <div className="text-emerald-400">✓ {item.success} success | <span className="text-rose-400">✗ {item.failed} failed</span></div>
                </div>

                {/* Bar */}
                <div 
                  className="w-full rounded-t-md transition-all duration-300 group-hover:brightness-125 overflow-hidden flex flex-col justify-end"
                  style={{ height: `${totalHeightPct}%` }}
                >
                  {item.failed > 0 && (
                    <div 
                      className="w-full bg-rose-500/90 transition-all"
                      style={{ height: `${failPct}%` }}
                    />
                  )}
                  <div 
                    className="w-full bg-emerald-500/90 transition-all"
                    style={{ height: `${successPct}%` }}
                  />
                </div>

                {/* Label */}
                <span className="mt-2 text-[9px] font-mono text-gray-500 group-hover:text-gray-300">
                  {idx % 4 === 0 ? item.label : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
