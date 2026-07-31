"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import {
  getPolicy,
  checkDepeg,
  resolveCooling,
  requestManualReview,
  currentDayCounter,
  formatGen,
  type Policy,
} from "@/lib/contract";
import { StatusPill } from "@/components/StatusPill";
import { ActivityFeed } from "@/components/ActivityFeed";
import { DeviationGauge } from "@/components/DeviationGauge";
import { VerdictStamp } from "@/components/VerdictStamp";

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const policyId = Number(params.id);
  const { address, connect, connecting } = useWallet();

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justChecked, setJustChecked] = useState(false);

  async function load() {
    try {
      setPolicy(await getPolicy(policyId));
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load this policy.");
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
    try {
      await checkDepeg(address, policyId, currentDayCounter());
      await load();
      setJustChecked(true);
    } catch (err: any) {
      setError(err?.message ?? "Check failed.");
    } finally {
      setChecking(false);
    }
  }

  async function handleResolveCooling() {
    if (!address) return connect();
    setChecking(true);
    setError(null);
    try {
      await resolveCooling(address, policyId, currentDayCounter());
      await load();
      setJustChecked(true);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't resolve the cooling period.");
    } finally {
      setChecking(false);
    }
  }

  async function handleManualReview() {
    if (!address) return connect();
    setChecking(true);
    setError(null);
    try {
      await requestManualReview(address, policyId);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Manual review request failed.");
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div className="panel text-center text-sm text-ink-600">Loading policy…</div>;
  if (error && !policy) return <div className="panel border-brick-500/40 text-center text-sm text-brick-400">{error}</div>;
  if (!policy) return null;

  const daysElapsed = currentDayCounter() - policy.start_day;
  const daysLeft = Math.max(0, policy.duration_days - daysElapsed);
  const isLastDay = policy.status === "active" && daysLeft === 0;

  const lastCheckedPrice =
    policy.last_checked_day > 0 ? (policy.last_price_micros / 1_000_000).toFixed(6) : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="panel space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-700">
              Policy #{policyId}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold uppercase tracking-tight">
              {policy.coin_id}
            </h1>
          </div>
          <StatusPill status={policy.status} />
        </div>

        {/* Radial threshold gauge, needle shows the last checked price */}
        <div className="flex flex-col items-center rounded-md border border-ink-700 bg-ink-800/40 px-4 py-4">
          <DeviationGauge
            thresholdBps={policy.threshold_bps}
            lastPriceMicros={policy.last_price_micros || undefined}
          />
          {lastCheckedPrice && (
            <p className="mt-1 figure text-xs text-ink-600">
              Last read: ${lastCheckedPrice} on day {policy.last_checked_day}
            </p>
          )}
        </div>

        {/* Core terms */}
        <div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Threshold</span>
            <span className="figure text-sm text-parchment">{(policy.threshold_bps / 100).toFixed(2)}%</span>
          </div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Payout amount</span>
            <span className="figure text-sm text-parchment">{formatGen(policy.payout_amount)} GEN</span>
          </div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Premium paid</span>
            <span className="figure text-sm text-parchment">{formatGen(policy.premium_paid)} GEN</span>
          </div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">
              {policy.status === "active" ? "Days remaining" : "Duration"}
            </span>
            <span className="figure text-sm text-parchment">
              {policy.status === "active"
                ? isLastDay
                  ? "Last day"
                  : `${daysLeft}d left`
                : `${policy.duration_days}d`}
            </span>
          </div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Buyer</span>
            <span className="figure truncate pl-4 text-xs text-ink-500">{policy.buyer}</span>
          </div>
        </div>

        {justChecked && policy.status === "active" && (
          <p className="text-xs text-verdigris-400">Still on peg, still covered.</p>
        )}

        {policy.classification && (
          <VerdictStamp classification={policy.classification} reasoning={policy.resolved_note} />
        )}

        {/* Action area — one state at a time */}
        {policy.status === "active" && policy.consecutive_fetch_failures >= 3 && (
          <div className="space-y-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
            <p>
              {policy.consecutive_fetch_failures} consecutive price checks couldn't reach the
              feed.
            </p>
            <button onClick={handleManualReview} disabled={checking} className="btn-secondary w-full">
              Request manual review — extends the coverage window
            </button>
          </div>
        )}

        {policy.status === "cooling" && (
          <div className="space-y-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-sm text-parchment">
              Flagged as possible manipulation. A second look is due on day{" "}
              <span className="figure text-amber-400">{policy.cooling_until_day}</span>.
            </p>
            {error && <p className="text-sm text-brick-400">{error}</p>}
            <button onClick={handleResolveCooling} disabled={checking} className="btn-primary w-full">
              {checking ? "Checking…" : "Resolve cooling period"}
            </button>
          </div>
        )}

        {policy.status === "active" && (
          <div className="space-y-2.5">
            {error && <p className="text-sm text-brick-400">{error}</p>}
            {isLastDay && (
              <p className="text-xs text-ink-600">
                Today is the last day this policy can trigger a payout — check it before it
                expires.
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
          <div className="rounded-md border border-sage-500/30 bg-sage-500/5 px-4 py-3 text-sm text-sage-400">
            Depeg confirmed by validators. Payout released.
          </div>
        )}

        {policy.status === "expired" && (
          <div className="rounded-md border border-ink-700 bg-ink-800/40 px-4 py-3 text-sm text-ink-600">
            Window closed with no depeg. Capital released back to underwriters.
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">History for this policy</h2>
        <ActivityFeed
          filterFn={(e) => e.functionName === "check_depeg" && Number(e.args[0]) === policyId}
        />
      </div>
    </div>
  );
}
