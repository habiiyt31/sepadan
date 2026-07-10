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
      setSuccess(`Deposited ${depositAmount} GEN — shares minted.`);
      setDepositAmount("");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Deposit failed");
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
      const { receipt } = await withdraw(address, shares);
      const amount = receipt?.data?.return_data;
      setSuccess(`Withdrew ${formatGen(BigInt(amount ?? 0))} GEN.`);
      setWithdrawShares("");
      await load();
    } catch (err: any) {
      setError(
        err?.message ??
          "Withdraw failed — you may be trying to withdraw more than the pool's unreserved balance."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Underwrite the pool</h1>
        <p className="mt-1 text-sm text-slate-400">
          Deposit GEN, earn shares. Withdraw anytime the pool isn't reserving your capital.
        </p>
      </div>

      {pool && (
        <div className="card">
          <PoolStats pool={pool} />
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <form onSubmit={handleDeposit} className="card space-y-4">
          <h2 className="text-sm font-semibold text-mint-400">Deposit</h2>
          <div>
            <label className="label" htmlFor="deposit">Amount (GEN)</label>
            <input
              id="deposit"
              type="number"
              step="0.0001"
              min="0"
              className="input"
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

        <form onSubmit={handleWithdraw} className="card space-y-4">
          <h2 className="text-sm font-semibold text-mint-400">Withdraw</h2>
          <div>
            <label className="label" htmlFor="withdraw">Shares to burn</label>
            <input
              id="withdraw"
              type="number"
              step="0.0001"
              min="0"
              className="input"
              placeholder="5"
              value={withdrawShares}
              onChange={(e) => setWithdrawShares(e.target.value)}
              required
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Minted 1:1 with GEN at deposit time.
            </p>
          </div>
          <button
            type="submit"
            className="btn-secondary w-full"
            disabled={busy === "withdraw"}
          >
            {!address
              ? connecting ? "Connecting…" : "Connect wallet"
              : busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        </form>
      </div>

      {error && (
        <div className="card border-danger-400/30 bg-danger-400/5 text-sm text-danger-400">
          {error}
        </div>
      )}
      {success && (
        <div className="card border-mint-500/30 bg-mint-500/5 text-sm text-mint-400">
          {success}
        </div>
      )}
    </div>
  );
}
