"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolState, type PoolState } from "@/lib/contract";
import { PoolStats } from "@/components/PoolStats";
import { ActivityFeed } from "@/components/ActivityFeed";

const TRACKED = [
  { label: "USDT", note: "typically within 0.1% of peg" },
  { label: "USDC", note: "typically within 0.1% of peg" },
  { label: "DAI", note: "wider band, over-collateralized" },
];

export default function HomePage() {
  const [pool, setPool] = useState<PoolState | null>(null);

  useEffect(() => {
    getPoolState().then(setPool).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero: the peg line itself is the opening statement */}
      <section className="ledger">
        <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-600">
          Parametric cover · settled by GenLayer validators
        </p>

        <div className="mb-6">
          <div className="peg-line" />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {TRACKED.map((c) => (
              <div key={c.label} className="flex items-baseline gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-peg-400" />
                <span className="font-mono text-xs text-parchment">{c.label}</span>
                <span className="text-xs text-ink-600">— {c.note}</span>
              </div>
            ))}
          </div>
        </div>

        <h1 className="font-display text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
          Cover that pays when a peg breaks, confirmed by validators — not by anyone's word.
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
          Fund the pool, buy a policy on a stablecoin, and set the deviation that counts as
          a break. Validators fetch the live price themselves before anything pays out.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/policy/new" className="btn-primary">Buy cover</Link>
          <Link href="/underwrite" className="btn-secondary">Underwrite the pool</Link>
        </div>
      </section>

      {pool && (
        <section className="ledger">
          <h2 className="mb-3 font-display text-sm font-semibold text-parchment">Pool status</h2>
          <PoolStats pool={pool} />
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">How cover resolves</h2>
        <div className="ledger">
          {[
            ["01", "Fund the pool", "Underwriters deposit GEN and earn a share of every premium paid."],
            ["02", "Buy a policy", "Pick a coin, a deviation threshold, a payout amount, and a duration."],
            ["03", "Validators settle it", "Anyone can trigger a check. Validators fetch the live price and pay out or let it expire."],
          ].map(([n, title, body]) => (
            <div key={n} className="ledger-row items-start">
              <span className="font-mono text-xs text-brass-500">{n}</span>
              <div className="flex-1 pl-4 text-left">
                <p className="font-display text-sm font-medium text-parchment">{title}</p>
                <p className="mt-0.5 text-xs text-ink-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ledger">
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">Recent activity</h2>
        <ActivityFeed />
      </section>

      <Link
        href="/policies"
        className="block rounded-md border border-ink-700 px-3.5 py-2.5 text-center text-sm text-ink-600 transition hover:border-brass-500/40 hover:text-brass-300"
      >
        Browse all policies →
      </Link>
    </div>
  );
}
