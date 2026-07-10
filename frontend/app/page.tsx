"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolState, type PoolState } from "@/lib/contract";
import { PoolStats } from "@/components/PoolStats";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function HomePage() {
  const [pool, setPool] = useState<PoolState | null>(null);

  useEffect(() => {
    getPoolState().then(setPool).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <section className="card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-mint-400">
          Parametric insurance · GenLayer
        </p>
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
          Insurance that pays out on real prices, verified by validators — not on anyone's word.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Buy a policy on a stablecoin. If its price breaks your threshold,
          validators confirm it from a live price feed and funds release
          automatically.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/policy/new" className="btn-primary">Buy cover</Link>
          <Link href="/underwrite" className="btn-secondary">Underwrite the pool</Link>
        </div>
      </section>

      {pool && (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Pool status</h2>
          <PoolStats pool={pool} />
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="stat">
          <p className="text-xs font-semibold text-mint-400">1. Fund the pool</p>
          <p className="mt-1 text-xs text-slate-400">Underwriters deposit GEN, earn a share of every premium.</p>
        </div>
        <div className="stat">
          <p className="text-xs font-semibold text-mint-400">2. Buy a policy</p>
          <p className="mt-1 text-xs text-slate-400">Pick a coin, threshold, payout, and duration.</p>
        </div>
        <div className="stat">
          <p className="text-xs font-semibold text-mint-400">3. Auto-settled</p>
          <p className="mt-1 text-xs text-slate-400">Validators fetch the live price and pay out or expire it.</p>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Recent activity</h2>
        <ActivityFeed />
      </section>

      <Link
        href="/policies"
        className="block rounded-xl border border-white/10 bg-ink-800/40 px-3.5 py-2.5 text-center text-sm text-slate-400 transition hover:border-mint-500/40 hover:text-mint-400"
      >
        Browse all policies →
      </Link>
    </div>
  );
}
