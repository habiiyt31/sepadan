import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, getReadClient, ensureCorrectNetwork } from "./genlayer";
import { logActivity, getActivityLog, explorerTxUrl } from "./activityLog";

export type Policy = {
  buyer: string;
  coin_id: string;
  threshold_bps: number;
  payout_amount: bigint;
  premium_paid: bigint;
  start_day: number;
  duration_days: number;
  status: "active" | "claimed" | "expired" | "cooling";
  classification: "" | "STRUCTURAL_FAILURE" | "TRANSIENT_VOLATILITY" | "MANIPULATION_SUSPECTED";
  resolved_note: string;
  consecutive_fetch_failures: number;
  cooling_until_day: number;
  manual_reviews_requested: number;
  last_checked_day: number;
  last_price_micros: number;
};

export type PoolState = {
  pool_balance: bigint;
  reserved: bigint;
  available: bigint;
  total_shares: bigint;
};

// ---------------- reads ----------------

export async function getPolicy(policyId: number): Promise<Policy> {
  const client = getReadClient();
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_policy",
    args: [policyId],
  })) as Record<string, unknown>;

  return {
    buyer: raw.buyer as string,
    coin_id: raw.coin_id as string,
    threshold_bps: Number(raw.threshold_bps),
    payout_amount: BigInt(raw.payout_amount as any),
    premium_paid: BigInt(raw.premium_paid as any),
    start_day: Number(raw.start_day),
    duration_days: Number(raw.duration_days),
    status: raw.status as Policy["status"],
    classification: (raw.classification as Policy["classification"]) ?? "",
    resolved_note: (raw.resolved_note as string) ?? "",
    consecutive_fetch_failures: Number(raw.consecutive_fetch_failures ?? 0),
    cooling_until_day: Number(raw.cooling_until_day ?? 0),
    manual_reviews_requested: Number(raw.manual_reviews_requested ?? 0),
    last_checked_day: Number(raw.last_checked_day ?? 0),
    last_price_micros: Number(raw.last_price_micros ?? 0),
  };
}

export async function getPolicyCount(): Promise<number> {
  const client = getReadClient();
  const count = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_policy_count",
    args: [],
  });
  return Number(count);
}

export async function getPoolState(): Promise<PoolState> {
  const client = getReadClient();
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_pool_state",
    args: [],
  })) as Record<string, unknown>;

  // readContract's runtime values aren't guaranteed to already be
  // BigInt just because we type them that way — coerce explicitly so
  // downstream arithmetic never silently mixes BigInt and Number.
  return {
    pool_balance: BigInt(raw.pool_balance as any),
    reserved: BigInt(raw.reserved as any),
    available: BigInt(raw.available as any),
    total_shares: BigInt(raw.total_shares as any),
  };
}

export async function getAvailableCapacity(): Promise<bigint> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_available_capacity",
    args: [],
  });
  return BigInt(raw as any);
}

// ---------------- writes ----------------
// Every write connects the wallet to the configured network, submits,
// then waits for FINALIZED consensus before trusting the result.

async function writeAndWait(
  walletAddress: `0x${string}`,
  functionName: string,
  args: any[],
  value: bigint = BigInt(0)
) {
  const client = await ensureCorrectNetwork(walletAddress);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });

  logActivity({ hash, functionName, args, status: "pending", timestamp: Date.now() });

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      retries: 120,
      interval: 3000,
    });
    logActivity({ hash, functionName, args, status: "finalized", timestamp: Date.now() });
    return { hash, receipt };
  } catch (err: any) {
    // Consensus can take longer than our wait window even though the
    // transaction is still progressing normally — don't treat this as
    // a failure, just hand back the hash so the caller can point the
    // user at the Explorer instead of showing a scary error.
    logActivity({ hash, functionName, args, status: "pending-long", timestamp: Date.now() });
    throw new Error(
      `Still finalizing on-chain (this can take longer than usual). Check the transaction directly: ${explorerTxUrl(hash)}`
    );
  }
}

export async function deposit(walletAddress: `0x${string}`, amountWei: bigint) {
  return writeAndWait(walletAddress, "deposit", [], amountWei);
}

export async function withdraw(walletAddress: `0x${string}`, sharesToBurn: bigint) {
  return writeAndWait(walletAddress, "withdraw", [sharesToBurn]);
}

export async function createPolicy(
  walletAddress: `0x${string}`,
  coinId: string,
  thresholdBps: number,
  payoutAmountWei: bigint,
  durationDays: number,
  currentDay: number,
  premiumWei: bigint
) {
  return writeAndWait(
    walletAddress,
    "create_policy",
    [coinId, thresholdBps, payoutAmountWei, durationDays, currentDay],
    premiumWei
  );
}

export async function checkDepeg(
  walletAddress: `0x${string}`,
  policyId: number,
  currentDay: number
) {
  return writeAndWait(walletAddress, "check_depeg", [policyId, currentDay]);
}

export async function resolveCooling(
  walletAddress: `0x${string}`,
  policyId: number,
  currentDay: number
) {
  return writeAndWait(walletAddress, "resolve_cooling", [policyId, currentDay]);
}

export async function requestManualReview(
  walletAddress: `0x${string}`,
  policyId: number
) {
  return writeAndWait(walletAddress, "request_manual_review", [policyId]);
}

// ---------------- reconciliation for orphaned "pending" entries ----------------
// If a page was navigated away from / refreshed while writeAndWait was
// still awaiting finalization, that promise never gets to write the
// "finalized" update -- the transaction itself keeps going on-chain,
// but the local log is stuck on "pending" forever. This re-checks any
// pending entries against the actual chain state and catches them up.

export async function reconcilePendingActivity(): Promise<void> {
  const pending = getActivityLog().filter(
    (e) => e.status === "pending" || e.status === "pending-long"
  );
  if (pending.length === 0) return;

  const client = getReadClient();

  await Promise.all(
    pending.map(async (entry) => {
      try {
        // Short check, not a long wait -- if it's already finalized
        // on-chain this resolves almost immediately; if not, it times
        // out quickly and we just leave the entry as-is for the next
        // reconciliation pass.
        await client.waitForTransactionReceipt({
          hash: entry.hash as any,
          status: TransactionStatus.FINALIZED,
          retries: 3,
          interval: 1000,
        });
        logActivity({ ...entry, status: "finalized", timestamp: entry.timestamp });
      } catch {
        // Not finalized yet (or still can't confirm) -- try again on
        // the next reconciliation pass rather than guessing.
      }
    })
  );
}

// ---------------- helpers ----------------

export function currentDayCounter(): number {
  return Math.floor(Date.now() / (1000 * 60 * 60 * 24));
}

export const SUPPORTED_COINS = [
  { id: "tether", label: "USDT — Tether" },
  { id: "usd-coin", label: "USDC — USD Coin" },
  { id: "dai", label: "DAI — Dai" },
  { id: "frax", label: "FRAX — Frax" },
];

export function formatGen(wei: bigint): string {
  return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function genToWei(genAmount: string): bigint {
  return BigInt(Math.round(parseFloat(genAmount || "0") * 1e18));
}
