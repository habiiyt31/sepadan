"use client";

import Link from "next/link";
import { useWallet } from "@/lib/useWallet";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function NavBar() {
  const { address, connecting, error, connect } = useWallet();
  const network = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint-500/15 text-mint-400">
            ⚖
          </span>
          <span className="text-lg font-semibold tracking-tight">Sepadan</span>
          <span className="pill hidden bg-white/5 text-slate-400 sm:inline-flex">
            {network}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-slate-300 sm:flex">
          <Link href="/underwrite" className="hover:text-white">
            Underwrite
          </Link>
          <Link href="/policy/new" className="hover:text-white">
            Buy cover
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {address ? (
            <span className="pill border border-mint-500/30 bg-mint-500/10 text-mint-400">
              <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
              {shortAddress(address)}
            </span>
          ) : (
            <button onClick={connect} disabled={connecting} className="btn-primary">
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="mx-auto max-w-5xl px-4 pb-2 text-xs text-danger-400 sm:px-6">
          {error}
        </div>
      )}
      <div className="mx-auto flex max-w-5xl items-center gap-5 px-4 pb-3 text-sm font-medium text-slate-300 sm:hidden sm:px-6">
        <Link href="/underwrite" className="hover:text-white">Underwrite</Link>
        <Link href="/policy/new" className="hover:text-white">Buy cover</Link>
      </div>
    </header>
  );
}
