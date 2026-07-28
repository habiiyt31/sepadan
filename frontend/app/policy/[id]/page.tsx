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

  if (loading) return <div className="ledger text-center text-sm text-ink-600">Loading policy…</div>;
  if (error && !policy) return <div className="ledger border-alert-500/40 text-center text-sm text-alert-400">{error}</div>;
  if (!policy) return null;

  const daysElapsed = currentDayCounter() - policy.start_day;
  const daysLeft = Math.max(0, policy.duration_days - daysElapsed);
  const isLastDay = policy.status === "active" && daysLeft === 0;
  const upperBound = (1 + policy.threshold_bps / 10000).toFixed(4);
  const lowerBound = (1 - policy.threshold_bps / 10000).toFixed(4);

  // Derived from chain state, not from transient click state — this
  // stays correct across reloads and page navigations, unlike a
  // "last result" that only lived in React state.
  const lastCheckedPrice =
    policy.last_checked_day > 0 ? (policy.last_price_micros / 1_000_000).toFixed(6) : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="ledger space-y-5">
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

        {/* Threshold band on the peg line */}
        <div className="rounded-md border border-ink-700 bg-ink-800/40 px-4 py-3">
          <div className="peg-line" />
          <p className="mt-2 figure text-xs text-ink-600">
            Covered outside <span className="text-alert-400">${lowerBound}</span>–
            <span className="text-alert-400">${upperBound}</span>
          </p>
        </div>

        {/* Core terms */}
        <div>
          <div className="ledger-row">
            <span className="text-sm text-ink-600">Threshold</span>
            <span className="figure text-sm text-parchment">{(policy.threshold_bps / 100).toFixed(2)}%</span>
          </div>
          <div className="ledger-row">
            <span className="text-sm text-ink-600">Payout amount</span>
            <span className="figure text-sm text-parchment">{formatGen(policy.payout_amount)} GEN</span>
          </div>
          <div className="ledger-row">
            <span className="text-sm text-ink-600">Premium paid</span>
            <span className="figure text-sm text-parchment">{formatGen(policy.premium_paid)} GEN</span>
          </div>
          <div className="ledger-row">
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
          <div className="ledger-row">
            <span className="text-sm text-ink-600">Buyer</span>
            <span className="figure truncate pl-4 text-xs text-ink-500">{policy.buyer}</span>
          </div>
        </div>

        {/* Persistent last-check result — survives reloads because it
            reads from chain state, not from a click that already happened. */}
        {lastCheckedPrice && (
          <div className="rounded-md border border-ink-700 bg-ink-800/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-600">Last checked</p>
            <p className="mt-0.5 figure text-sm text-parchment">
              Day {policy.last_checked_day} — ${lastCheckedPrice}
            </p>
            {justChecked && policy.status === "active" && (
              <p className="mt-1 text-xs text-peg-400">Still on peg, still covered.</p>
            )}
          </div>
        )}

        {policy.classification && (
          <div className="rounded-md border border-ink-700 bg-ink-800/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-600">AI classification</p>
            <p className="mt-0.5 font-display text-sm font-semibold text-parchment">
              {policy.classification}
            </p>
            {policy.resolved_note && (
              <p className="mt-1 text-xs text-ink-600">{policy.resolved_note}</p>
            )}
          </div>
        )}

        {/* Action area — one state at a time */}
        {policy.status === "active" && policy.consecutive_fetch_failures >= 3 && (
          <div className="space-y-2.5 rounded-md border border-brass-500/30 bg-brass-500/5 px-4 py-3 text-sm text-brass-400">
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
          <div className="space-y-2.5 rounded-md border border-brass-500/30 bg-brass-500/5 px-4 py-3">
            <p className="text-sm text-parchment">
              Flagged as possible manipulation. A second look is due on day{" "}
              <span className="figure text-brass-400">{policy.cooling_until_day}</span>.
            </p>
            {error && <p className="text-sm text-alert-400">{error}</p>}
            <button onClick={handleResolveCooling} disabled={checking} className="btn-primary w-full">
              {checking ? "Checking…" : "Resolve cooling period"}
            </button>
          </div>
        )}

        {policy.status === "active" && (
          <div className="space-y-2.5">
            {error && <p className="text-sm text-alert-400">{error}</p>}
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
          <div className="rounded-md border border-confirm-500/30 bg-confirm-500/5 px-4 py-3 text-sm text-confirm-400">
            Depeg confirmed by validators. Payout released.
          </div>
        )}

        {policy.status === "expired" && (
          <div className="rounded-md border border-ink-700 bg-ink-800/40 px-4 py-3 text-sm text-ink-600">
            Window closed with no depeg. Capital released back to underwriters.
          </div>
        )}
      </div>

      <div className="ledger">
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">History for this policy</h2>
        <ActivityFeed
          filterFn={(e) => e.functionName === "check_depeg" && Number(e.args[0]) === policyId}
        />
      </div>
    </div>
  );
}
