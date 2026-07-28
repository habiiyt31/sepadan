import clsx from "clsx";

const STYLES: Record<string, string> = {
  active: "bg-peg-500/10 text-peg-400 border border-peg-500/40",
  claimed: "bg-confirm-500/10 text-confirm-400 border border-confirm-500/40",
  expired: "bg-ink-800 text-ink-600 border border-ink-700",
  cooling: "bg-brass-500/10 text-brass-400 border border-brass-500/40",
  inactive: "bg-ink-800 text-ink-600 border border-ink-700",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={clsx("pill", STYLES[status] ?? STYLES.inactive)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
