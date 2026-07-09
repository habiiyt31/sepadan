"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolState, type PoolState } from "@/lib/contract";
import { PoolStats } from "@/components/PoolStats";

const STEPS = [
  {
    title: "1. Underwriters fund the pool",
    body: "Anyone can deposit GEN and receive shares. Premiums from policies flow into the same pool, growing the value of every share over time.",
  },
  {
    title: "2. Buyers cover a stablecoin",
    body: "Pick a coin, a depeg threshold (e.g. 3%), a payout amount, and a duration. Payout capacity is reserved from the pool the instant you buy — never oversold.",
  },
  {
    title: "3. Validators watch the real price",
    body: "Anyone can trigger a check. Validators independently fetch the live CoinGecko price and must agree within a tight tolerance — no one's word is taken for it.",
  },
  {
    title: "4. Payout or expiry, automatically",
    body: "If the fetched price breached your threshold, funds release to you immediately. If the window passes without a depeg, the premium stays with underwriters.",
  },
];

export default function HomePage() {
  const [pool, setPool] = useState<PoolState | null>(null);

  useEffect(() => {
    getPoolState()
      .then(setPool)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-10">
      <section className="card overflow-hidden">
        <div className="grid gap-8 sm:grid-cols-2 sm:items-center">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-mint-400">
              Parametric depeg insurance
            </p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Insurance that pays out on real prices, not promises.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
              Sepadan settles stablecoin depeg claims on GenLayer.
              Validators fetch the live market price themselves and must
              agree within a tight tolerance — no oracle middleman, no
              claims adjuster, no trusting anyone's word.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/policy/new" className="btn-primary">
                Buy cover
              </Link>
              <Link href="/underwrite" className="btn-secondary">
                Underwrite the pool
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-ink-800/50 p-4 font-mono text-xs leading-relaxed text-slate-400">
            <p className="text-mint-400"># check_depeg(policy_id)</p>
            <p>fetch api.coingecko.com/simple/price</p>
            <p className="text-slate-500">→ every validator fetches independently</p>
            <p className="text-slate-500">→ agree within 0.2% tolerance, or it fails</p>
          </div>
        </div>
      </section>

      {pool && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Pool status</h2>
          <div className="card">
            <PoolStats pool={pool} />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step) => (
            <div key={step.title} className="card">
              <h3 className="mb-1.5 text-sm font-semibold text-mint-400">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Look up a policy</h2>
        <p className="mb-4 text-sm text-slate-400">
          Know the policy ID? Jump straight to it.
        </p>
        <Link
          href="/policy/0"
          className="block rounded-xl border border-white/10 bg-ink-800/40 px-3.5 py-2.5 text-center text-sm text-slate-400 transition hover:border-mint-500/40 hover:text-mint-400"
        >
          Browse policy #0 →
        </Link>
      </section>
    </div>
  );
}
