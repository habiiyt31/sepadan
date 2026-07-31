import clsx from "clsx";

const STYLES: Record<string, string> = {
  active: "bg-verdigris-500/10 text-verdigris-400 border border-verdigris-500/40",
  claimed: "bg-sage-500/10 text-sage-400 border border-sage-500/40",
  expired: "bg-ink-800 text-ink-600 border border-ink-700",
  cooling: "bg-amber-500/10 text-amber-400 border border-amber-500/40",
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
