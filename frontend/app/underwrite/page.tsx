"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/useWallet";
import {
  deposit,
  withdraw,
  getPoolState,
  formatGen,
  genToWei,
  type PoolState,
} from "@/lib/contract";
import { PoolStats } from "@/components/PoolStats";

export default function UnderwritePage() {
  const { address, connect, connecting } = useWallet();
  const [pool, setPool] = useState<PoolState | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    try {
      setPool(await getPoolState());
    } catch {
      /* pool not deployed / contract address missing yet */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setBusy("deposit");
    setError(null);
    setSuccess(null);
    try {
      await deposit(address, genToWei(depositAmount));
      setSuccess(`Deposited ${depositAmount} GEN. Shares minted.`);
      setDepositAmount("");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Deposit failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setBusy("withdraw");
    setError(null);
    setSuccess(null);
    try {
      const shares = genToWei(withdrawShares);
      const estimate =
        pool && pool.total_shares > BigInt(0)
          ? (shares * pool.pool_balance) / pool.total_shares
          : BigInt(0);
      await withdraw(address, shares);
      setSuccess(`Withdrew ~${formatGen(estimate)} GEN.`);
      setWithdrawShares("");
      await load();
    } catch (err: any) {
      setError(
        err?.message ?? "Withdraw failed. You may be asking for more than the pool's unreserved balance."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Underwrite the pool</h1>
        <p className="mt-1 text-sm text-ink-600">
          Deposit GEN and earn shares. Withdraw whatever the pool isn't reserving for open policies.
        </p>
      </div>

      {pool && (
        <div className="ledger">
          <PoolStats pool={pool} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={handleDeposit} className="ledger space-y-4">
          <h2 className="font-display text-sm font-semibold text-brass-400">Deposit</h2>
          <div>
            <label className="field-label" htmlFor="deposit">Amount (GEN)</label>
            <input
              id="deposit"
              type="number"
              step="0.0001"
              min="0"
              className="field-input"
              placeholder="10"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy === "deposit"}>
            {!address
              ? connecting ? "Connecting…" : "Connect wallet"
              : busy === "deposit" ? "Depositing…" : "Deposit"}
          </button>
        </form>

        <form onSubmit={handleWithdraw} className="ledger space-y-4">
          <h2 className="font-display text-sm font-semibold text-brass-400">Withdraw</h2>
          <div>
            <label className="field-label" htmlFor="withdraw">Shares to burn</label>
            <input
              id="withdraw"
              type="number"
              step="0.0001"
              min="0"
              className="field-input"
              placeholder="5"
              value={withdrawShares}
              onChange={(e) => setWithdrawShares(e.target.value)}
              required
            />
            <p className="field-hint">Minted 1:1 with GEN at deposit time.</p>
          </div>
          <button type="submit" className="btn-secondary w-full" disabled={busy === "withdraw"}>
            {!address
              ? connecting ? "Connecting…" : "Connect wallet"
              : busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        </form>
      </div>

      {error && (
        <div className="ledger border-alert-500/40 bg-alert-500/5 text-sm text-alert-400">
          {error}
        </div>
      )}
      {success && (
        <div className="ledger border-confirm-500/40 bg-confirm-500/5 text-sm text-confirm-400">
          {success}
        </div>
      )}
    </div>
  );
}
