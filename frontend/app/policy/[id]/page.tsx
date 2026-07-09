"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import { getPolicy, checkDepeg, currentDayCounter, formatGen, type Policy } from "@/lib/contract";
import { StatusPill } from "@/components/StatusPill";

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const policyId = Number(params.id);
  const { address, connect, connecting } = useWallet();

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function load() {
    try {
      setPolicy(await getPolicy(policyId));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load policy");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  async function handleCheck() {
    if (!address) return connect();
    setChecking(true);
    setError(null);
    setLastResult(null);
    try {
      const { receipt } = await checkDepeg(address, policyId, currentDayCounter());
      const status = receipt?.data?.return_data;
      setLastResult(String(status));
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Check failed");
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div className="card text-center text-sm text-slate-400">Loading policy…</div>;
  if (error && !policy) return <div className="card text-center text-sm text-danger-400">{error}</div>;
  if (!policy) return null;

  const daysElapsed = currentDayCounter() - policy.start_day;
  const daysLeft = Math.max(0, policy.duration_days - daysElapsed);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="card space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Policy #{policyId}</p>
            <h1 className="mt-1 text-2xl font-bold uppercase">{policy.coin_id}</h1>
          </div>
          <StatusPill status={policy.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-ink-800/40 p-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Threshold</p>
            <p className="font-semibold">{(policy.threshold_bps / 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Payout amount</p>
            <p className="font-semibold">{formatGen(policy.payout_amount)} GEN</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Premium paid</p>
            <p className="font-semibold">{formatGen(policy.premium_paid)} GEN</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">
              {policy.status === "active" ? "Days remaining" : "Duration"}
            </p>
            <p className="font-semibold">
              {policy.status === "active" ? `${daysLeft}d left` : `${policy.duration_days}d`}
            </p>
          </div>
        </div>

        <div className="truncate text-xs text-slate-500">
          Buyer: <span className="font-mono text-slate-400">{policy.buyer}</span>
        </div>

        {policy.status === "active" && (
          <div className="space-y-3 rounded-xl border border-peg-500/20 bg-peg-500/5 p-4">
            <p className="text-sm text-slate-300">
              Anyone can trigger a check — validators fetch the live price
              themselves, so there's nothing to gain by calling it early
              or often.
            </p>
            {error && <p className="text-sm text-danger-400">{error}</p>}
            {lastResult && (
              <p className="text-sm text-peg-400">
                Result: <strong>{lastResult}</strong>
                {lastResult === "active" && " — no depeg detected yet, still covered."}
              </p>
            )}
            <button onClick={handleCheck} disabled={checking} className="btn-primary w-full">
              {!address
                ? connecting ? "Connecting…" : "Connect wallet to check"
                : checking ? "Fetching live price via validators…" : "Check for depeg now"}
            </button>
          </div>
        )}

        {policy.status === "claimed" && (
          <div className="rounded-xl border border-mint-500/20 bg-mint-500/5 p-4 text-sm text-mint-400">
            ✓ Depeg confirmed by validator consensus — payout released to buyer.
          </div>
        )}

        {policy.status === "expired" && (
          <div className="rounded-xl border border-white/10 bg-ink-800/40 p-4 text-sm text-slate-400">
            Policy window passed without a qualifying depeg. Reserved
            capital was released back to underwriters.
          </div>
        )}
      </div>
    </div>
  );
}
