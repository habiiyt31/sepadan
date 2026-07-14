import clsx from "clsx";

const STYLES: Record<string, string> = {
  active: "bg-peg-500/10 text-peg-400 border border-peg-500/30",
  claimed: "bg-mint-500/10 text-mint-400 border border-mint-500/30",
  expired: "bg-white/5 text-slate-400 border border-white/10",
  cooling: "bg-warn-400/10 text-warn-400 border border-warn-400/30",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={clsx("pill", STYLES[status] ?? STYLES.expired)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
