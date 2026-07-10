"use client";

import { useEffect, useState } from "react";
import { getActivityLog, explorerTxUrl, type ActivityEntry } from "@/lib/activityLog";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const STATUS_LABEL: Record<ActivityEntry["status"], string> = {
  pending: "Pending…",
  finalized: "Finalized",
  "pending-long": "Still finalizing",
};

const STATUS_COLOR: Record<ActivityEntry["status"], string> = {
  pending: "text-warn-400",
  finalized: "text-mint-400",
  "pending-long": "text-warn-400",
};

export function ActivityFeed({ filterFn }: { filterFn?: (e: ActivityEntry) => boolean }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    function refresh() {
      const all = getActivityLog();
      setEntries(filterFn ? all.filter(filterFn) : all);
    }
    refresh();
    window.addEventListener("sepadan:activity-updated", refresh);
    window.addEventListener("storage", refresh);
    const interval = setInterval(refresh, 4000); // catch pending -> finalized transitions
    return () => {
      window.removeEventListener("sepadan:activity-updated", refresh);
      window.removeEventListener("storage", refresh);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No transactions yet.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <a
          key={e.hash}
          href={explorerTxUrl(e.hash)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg border border-white/10 bg-ink-800/40 px-3 py-2 text-xs transition hover:border-mint-500/30"
        >
          <div>
            <span className="font-mono text-slate-300">{e.functionName}</span>
            <span className="ml-2 text-slate-500">{shortHash(e.hash)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={STATUS_COLOR[e.status]}>{STATUS_LABEL[e.status]}</span>
            <span className="text-slate-600">{timeAgo(e.timestamp)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
