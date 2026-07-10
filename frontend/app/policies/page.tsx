"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPolicyCount, getPolicy, formatGen, type Policy } from "@/lib/contract";
import { StatusPill } from "@/components/StatusPill";

type Row = Policy & { id: number };

export default function PoliciesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const count = await getPolicyCount();
        const ids = Array.from({ length: count }, (_, i) => i);
        const policies = await Promise.all(
          ids.map(async (id) => ({ ...(await getPolicy(id)), id }))
        );
        setRows(policies.reverse()); // newest first
      } catch (err: any) {
        setError(err?.message ?? "Failed to load policies");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All policies</h1>
        <Link href="/policy/new" className="btn-primary">Buy cover</Link>
      </div>

      {loading && <div className="card text-center text-sm text-slate-400">Loading…</div>}
      {error && <div className="card text-center text-sm text-danger-400">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="card text-center text-sm text-slate-400">No policies yet.</div>
      )}

      <div className="space-y-2">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/policy/${p.id}`}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-ink-900/60 px-4 py-3 transition hover:border-mint-500/40"
          >
            <div>
              <p className="text-xs text-slate-500">#{p.id}</p>
              <p className="font-semibold uppercase">{p.coin_id}</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-slate-300">{formatGen(p.payout_amount)} GEN</p>
              <p className="text-xs text-slate-500">{(p.threshold_bps / 100).toFixed(2)}% threshold</p>
            </div>
            <StatusPill status={p.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
