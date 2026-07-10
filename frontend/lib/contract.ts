import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, getReadClient, ensureCorrectNetwork } from "./genlayer";
import { logActivity, explorerTxUrl } from "./activityLog";

export type Policy = {
  buyer: string;
  coin_id: string;
  threshold_bps: number;
  payout_amount: bigint;
  premium_paid: bigint;
  start_day: number;
  duration_days: number;
  status: "active" | "claimed" | "expired";
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
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_policy",
    args: [policyId],
  }) as Promise<Policy>;
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
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_pool_state",
    args: [],
  }) as Promise<PoolState>;
}

export async function getAvailableCapacity(): Promise<bigint> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_available_capacity",
    args: [],
  }) as Promise<bigint>;
}

// ---------------- writes ----------------
// Every write connects the wallet to the configured network, submits,
// then waits for FINALIZED consensus before trusting the result.

async function writeAndWait(
  walletAddress: `0x${string}`,
  functionName: string,
  args: unknown[],
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
