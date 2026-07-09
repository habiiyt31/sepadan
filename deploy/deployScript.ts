import { deployContract } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";

/**
 * Official GenLayer deploy-script pattern
 * (docs.genlayer.com/developers/intelligent-contracts/deploying/deploy-scripts).
 *
 * `genlayer deploy` resolves the account/private key and the network
 * you picked via `genlayer network` (studionet or testnetBradbury per
 * genlayer.config.json) and calls this exported function with a
 * ready-to-use client — no manual client/account setup here.
 *
 * Sepadan's __init__ takes no constructor arguments (see
 * contracts/sepadan.py) — the pool starts empty and every parameter
 * that matters (thresholds, tolerance, duration bounds) is enforced
 * per-policy at write-time, not fixed at deploy time.
 */

export default async function main(client: GenLayerClient<any>) {
  const sepadan = await deployContract(client, "contracts/sepadan.py", []);

  console.log("✅ Sepadan deployed at:", sepadan.address);
  console.log(
    `Add this to frontend/.env as NEXT_PUBLIC_CONTRACT_ADDRESS=${sepadan.address}`
  );
}
