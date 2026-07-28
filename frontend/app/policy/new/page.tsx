"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import {
  createPolicy,
  currentDayCounter,
  genToWei,
  getPolicyCount,
  SUPPORTED_COINS,
} from "@/lib/contract";

export default function NewPolicyPage() {
  const router = useRouter();
  const { address, connect, connecting } = useWallet();

  const [coinId, setCoinId] = useState(SUPPORTED_COINS[0].id);
  const [thresholdPct, setThresholdPct] = useState("3");
  const [payoutGen, setPayoutGen] = useState("");
  const [premiumGen, setPremiumGen] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setBusy(true);
    setError(null);
    try {
      const idBeforeCreate = await getPolicyCount();
      const thresholdBps = Math.round(parseFloat(thresholdPct) * 100);
      await createPolicy(
        address,
        coinId,
        thresholdBps,
        genToWei(payoutGen),
        parseInt(durationDays, 10),
        currentDayCounter(),
        genToWei(premiumGen)
      );
      router.push(`/policy/${idBeforeCreate}`);
    } catch (err: any) {
      setError(
        (err?.message ?? "Couldn't create the policy.") +
          " Check /policies in a moment — it may have gone through anyway."
      );
    } finally {
      setBusy(false);
    }
  }

  const threshold = parseFloat(thresholdPct || "0");
  const upperBound = (1 + threshold / 100).toFixed(4);
  const lowerBound = (1 - threshold / 100).toFixed(4);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Buy depeg cover</h1>
        <p className="mt-1 text-sm text-ink-600">
          Payout triggers once validators confirm the price crossed your threshold.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="ledger space-y-5">
        <div>
          <label className="field-label" htmlFor="coin">Stablecoin</label>
          <select
            id="coin"
            className="field-select"
            value={coinId}
            onChange={(e) => setCoinId(e.target.value)}
          >
            {SUPPORTED_COINS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="threshold">Deviation threshold (%)</label>
            <input
              id="threshold"
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              className="field-input"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="duration">Duration (days)</label>
            <input
              id="duration"
              type="number"
              step="1"
              min="1"
              max="365"
              className="field-input"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Live preview tied directly to the peg-line motif */}
        {threshold > 0 && (
          <div className="rounded-md border border-ink-700 bg-ink-800/40 px-4 py-3">
            <div className="peg-line" />
            <p className="mt-2 figure text-xs text-ink-600">
              Pays out below <span className="text-alert-400">${lowerBound}</span> or above{" "}
              <span className="text-alert-400">${upperBound}</span>
            </p>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="payout">Payout amount (GEN)</label>
          <input
            id="payout"
            type="number"
            step="0.0001"
            min="0"
            className="field-input"
            placeholder="1"
            value={payoutGen}
            onChange={(e) => setPayoutGen(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="premium">Premium you'll pay (GEN)</label>
          <input
            id="premium"
            type="number"
            step="0.0001"
            min="0"
            className="field-input"
            placeholder="0.05"
            value={premiumGen}
            onChange={(e) => setPremiumGen(e.target.value)}
            required
          />
          <p className="field-hint">Paid to the pool now, whether or not a depeg happens.</p>
        </div>

        {error && <p className="text-sm text-alert-400">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {!address
            ? connecting ? "Connecting…" : "Connect wallet to continue"
            : busy ? "Submitting…" : "Buy cover"}
        </button>
      </form>
    </div>
  );
}
