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
        setRows(policies.reverse());
      } catch (err: any) {
        setError(err?.message ?? "Couldn't load policies.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Policies</h1>
        <Link href="/policy/new" className="btn-primary">Buy cover</Link>
      </div>

      {loading && <div className="ledger text-center text-sm text-ink-600">Loading…</div>}
      {error && <div className="ledger border-alert-500/40 text-center text-sm text-alert-400">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="void-state">
          <p>No policies yet.</p>
          <Link href="/policy/new" className="text-brass-400 hover:text-brass-300">
            Buy the first one →
          </Link>
        </div>
      )}

      <div className="ledger p-0 sm:p-0">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/policy/${p.id}`}
            className="ledger-row px-5 transition hover:bg-ink-800/40 sm:px-6"
          >
            <div>
              <p className="font-mono text-[11px] text-ink-700">#{p.id}</p>
              <p className="font-display text-sm font-semibold uppercase tracking-wide">
                {p.coin_id}
              </p>
            </div>
            <div className="text-right">
              <p className="figure text-sm text-parchment">{formatGen(p.payout_amount)} GEN</p>
              <p className="figure text-[11px] text-ink-600">
                {(p.threshold_bps / 100).toFixed(2)}% threshold
              </p>
            </div>
            <StatusPill status={p.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
