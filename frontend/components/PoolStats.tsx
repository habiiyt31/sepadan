import { formatGen, type PoolState } from "@/lib/contract";

export function PoolStats({ pool }: { pool: PoolState }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="stat">
        <p className="text-xs text-slate-500">Total pool</p>
        <p className="mt-1 text-lg font-semibold">{formatGen(pool.pool_balance)}</p>
        <p className="text-xs text-slate-500">GEN</p>
      </div>
      <div className="stat">
        <p className="text-xs text-slate-500">Reserved</p>
        <p className="mt-1 text-lg font-semibold text-warn-400">
          {formatGen(pool.reserved)}
        </p>
        <p className="text-xs text-slate-500">GEN</p>
      </div>
      <div className="stat">
        <p className="text-xs text-slate-500">Available capacity</p>
        <p className="mt-1 text-lg font-semibold text-mint-400">
          {formatGen(pool.available)}
        </p>
        <p className="text-xs text-slate-500">GEN</p>
      </div>
      <div className="stat">
        <p className="text-xs text-slate-500">Total shares</p>
        <p className="mt-1 text-lg font-semibold">{formatGen(pool.total_shares)}</p>
        <p className="text-xs text-slate-500">shares</p>
      </div>
    </div>
  );
}
