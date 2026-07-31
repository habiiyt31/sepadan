"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolState, type PoolState } from "@/lib/contract";
import { PoolStats } from "@/components/PoolStats";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SealMark } from "@/components/SealMark";

const STEPS = [
  ["I", "Fund the pool", "Underwriters deposit GEN and earn a share of every premium paid."],
  ["II", "Buy a policy", "Pick a coin, a deviation threshold, a payout amount, and a duration."],
  ["III", "Validators rule on it", "A numeric check first. If it breaches, an AI classifies why before anything pays out."],
];

export default function HomePage() {
  const [pool, setPool] = useState<PoolState | null>(null);

  useEffect(() => {
    getPoolState().then(setPool).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <section className="panel">
        <div className="mb-5 flex items-center gap-3">
          <SealMark size={40} />
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-600">
            An adjudication contract, not a threshold check
          </p>
        </div>

        <h1 className="font-display text-2xl font-semibold italic leading-snug tracking-tight sm:text-3xl">
          Cover that pays when a peg breaks, ruled on by validators — not by anyone's word.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-600">
          Fund the pool, buy a policy on a stablecoin, and set the deviation that counts as
          a break. Validators verify the price themselves first, and only escalate to an AI
          ruling once something has genuinely gone wrong.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/policy/new" className="btn-primary">Buy cover</Link>
          <Link href="/underwrite" className="btn-secondary">Underwrite the pool</Link>
        </div>
      </section>

      {pool && (
        <section className="panel">
          <h2 className="mb-3 font-display text-sm font-semibold text-parchment">Pool status</h2>
          <PoolStats pool={pool} />
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">How a ruling is reached</h2>
        <div className="panel">
          {STEPS.map(([n, title, body]) => (
            <div key={n} className="panel-row items-start">
              <span className="font-display text-sm italic text-seal-gold">{n}</span>
              <div className="flex-1 pl-4 text-left">
                <p className="font-display text-sm font-medium text-parchment">{title}</p>
                <p className="mt-0.5 text-xs text-ink-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">Recent activity</h2>
        <ActivityFeed />
      </section>

      <Link
        href="/policies"
        className="block rounded-md border border-ink-700 px-3.5 py-2.5 text-center text-sm text-ink-600 transition hover:border-verdigris-500/40 hover:text-verdigris-300"
      >
        Browse all policies →
      </Link>
    </div>
  );
}
