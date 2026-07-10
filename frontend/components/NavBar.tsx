"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/useWallet";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function NavBar() {
  const { address, connecting, error, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint-500/15 text-mint-400">
            ⚖
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold">Sepadan</div>
            <div className="text-[11px] text-slate-500">Stablecoin depeg insurance</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-slate-300 sm:flex">
          <Link href="/underwrite" className="hover:text-white">Underwrite</Link>
          <Link href="/policy/new" className="hover:text-white">Buy cover</Link>
        </nav>

        <div className="relative" ref={menuRef}>
          {address ? (
            <>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="pill border border-mint-500/30 bg-mint-500/10 text-mint-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
                {shortAddress(address)}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-glow">
                  <button
                    onClick={() => {
                      disconnect();
                      setMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </>
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
