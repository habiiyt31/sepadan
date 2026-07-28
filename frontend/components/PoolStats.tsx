import { formatGen, type PoolState } from "@/lib/contract";

export function PoolStats({ pool }: { pool: PoolState }) {
  const total = Number(pool.pool_balance);
  const reservedPct = total > 0 ? (Number(pool.reserved) / total) * 100 : 0;

  return (
    <div>
      {/* Reserved-vs-available bar -- encodes real exposure, not decoration */}
      <div className="mb-4">
        <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-wide text-ink-600">
          <span>Committed to open policies</span>
          <span className="figure">{reservedPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-brass-500 transition-all"
            style={{ width: `${Math.min(100, reservedPct)}%` }}
          />
        </div>
      </div>

      <div className="ledger-row">
        <span className="text-sm text-ink-600">Total pool</span>
        <span className="figure text-sm text-parchment">{formatGen(pool.pool_balance)} GEN</span>
      </div>
      <div className="ledger-row">
        <span className="text-sm text-ink-600">Reserved</span>
        <span className="figure text-sm text-brass-400">{formatGen(pool.reserved)} GEN</span>
      </div>
      <div className="ledger-row">
        <span className="text-sm text-ink-600">Available capacity</span>
        <span className="figure text-sm text-confirm-400">{formatGen(pool.available)} GEN</span>
      </div>
      <div className="ledger-row">
        <span className="text-sm text-ink-600">Total shares</span>
        <span className="figure text-sm text-parchment">{formatGen(pool.total_shares)}</span>
      </div>
    </div>
  );
}
