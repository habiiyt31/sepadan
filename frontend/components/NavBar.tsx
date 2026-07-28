"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/useWallet";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}···${addr.slice(-4)}`;
}

/** A small mark built from the same peg-line motif used throughout the app. */
function PegMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="5" className="fill-ink-800 stroke-ink-700" />
      <line x1="5" y1="13" x2="21" y2="13" className="stroke-brass-500/70" strokeWidth="1" />
      <circle cx="17" cy="9" r="2.2" className="fill-brass-400" />
    </svg>
  );
}

export function NavBar() {
  const { address, connecting, error, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const network = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <PegMark />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight">Sepadan</div>
            <div className="text-[11px] text-ink-600">Stablecoin depeg insurance</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 font-display text-sm text-ink-600 sm:flex">
          <Link href="/policies" className="transition hover:text-parchment">Policies</Link>
          <Link href="/underwrite" className="transition hover:text-parchment">Underwrite</Link>
          <Link href="/policy/new" className="transition hover:text-parchment">Buy cover</Link>
        </nav>

        <div className="relative" ref={menuRef}>
          {address ? (
            <>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="pill border border-confirm-500/40 bg-confirm-500/10 text-confirm-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-confirm-400" />
                {shortAddress(address)}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-md border border-ink-700 bg-ink-900">
                  <button
                    onClick={() => {
                      disconnect();
                      setMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-sm text-ink-600 transition hover:bg-ink-800 hover:text-parchment"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </>
          ) : (
            <button onClick={connect} disabled={connecting} className="btn-primary">
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-4xl px-4 pb-2 text-xs text-alert-400 sm:px-6">{error}</div>
      )}

      <div className="mx-auto flex max-w-4xl items-center gap-5 px-4 pb-3 font-display text-sm text-ink-600 sm:hidden sm:px-6">
        <Link href="/policies" className="hover:text-parchment">Policies</Link>
        <Link href="/underwrite" className="hover:text-parchment">Underwrite</Link>
        <Link href="/policy/new" className="hover:text-parchment">Buy cover</Link>
        <span className="ml-auto font-mono text-[11px] text-ink-700">{network}</span>
      </div>
    </header>
  );
}
