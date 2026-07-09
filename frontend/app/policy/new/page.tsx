"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import {
  createPolicy,
  currentDayCounter,
  genToWei,
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
      const thresholdBps = Math.round(parseFloat(thresholdPct) * 100);
      const { receipt } = await createPolicy(
        address,
        coinId,
        thresholdBps,
        genToWei(payoutGen),
        parseInt(durationDays, 10),
        currentDayCounter(),
        genToWei(premiumGen)
      );
      const newId = receipt?.data?.return_data ?? 0;
      router.push(`/policy/${Number(newId)}`);
    } catch (err: any) {
      setError(
        err?.message ??
          "Failed to create policy — the pool may not have enough unreserved capacity for this payout amount."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Buy depeg cover</h1>
        <p className="mt-1 text-sm text-slate-400">
          Payout triggers automatically if validators confirm the price
          breached your threshold — read straight from CoinGecko.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="coin">Stablecoin</label>
          <select
            id="coin"
            className="select"
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
            <label className="label" htmlFor="threshold">Depeg threshold (%)</label>
            <input
              id="threshold"
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              className="input"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="duration">Duration (days)</label>
            <input
              id="duration"
              type="number"
              step="1"
              min="1"
              max="365"
              className="input"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="payout">Payout amount (GEN)</label>
          <input
            id="payout"
            type="number"
            step="0.0001"
            min="0"
            className="input"
            placeholder="1"
            value={payoutGen}
            onChange={(e) => setPayoutGen(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="premium">Premium you'll pay (GEN)</label>
          <input
            id="premium"
            type="number"
            step="0.0001"
            min="0"
            className="input"
            placeholder="0.05"
            value={premiumGen}
            onChange={(e) => setPremiumGen(e.target.value)}
            required
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Paid to the underwriting pool immediately, whether or not a
            depeg happens — this is what funds payouts for everyone.
          </p>
        </div>

        {error && <p className="text-sm text-danger-400">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {!address
            ? connecting ? "Connecting…" : "Connect wallet to continue"
            : busy ? "Submitting…" : "Buy cover"}
        </button>
      </form>
    </div>
  );
}
