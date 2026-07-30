import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";

const NETWORK = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

// No explicit return type here on purpose: genlayer-js/chains doesn't
// export a public "GenLayerChain" type to annotate this with, and
// guessing at internal type names has broken the build before.
// Letting TypeScript infer the return type from studionet/
// testnetBradbury themselves is more resilient to the SDK's internal
// type layout changing between versions.
export function resolveChain() {
  switch (NETWORK) {
    case "studionet":
      return studionet;
    case "testnetBradbury":
      return testnetBradbury;
    default:
      throw new Error(
        `Unknown NEXT_PUBLIC_GENLAYER_NETWORK "${NETWORK}". Use "studionet" or "testnetBradbury".`
      );
  }
}

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as any;

/** Read-only client. No wallet needed. */
export function getReadClient() {
  return createClient({
    chain: resolveChain(),
  });
}

/** Write client bound to the connected MetaMask address. */
export function getWriteClient(walletAddress: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet found. Install MetaMask to continue.");
  }
  return createClient({
    chain: resolveChain(),
    account: walletAddress as any,
    provider: window.ethereum,
  });
}

/** Ensures the connected wallet is on the configured GenLayer network. */
export async function ensureCorrectNetwork(walletAddress: string) {
  const client = getWriteClient(walletAddress);
  await client.connect(NETWORK as "studionet" | "testnetBradbury");
  return client;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
