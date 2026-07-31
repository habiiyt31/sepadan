const VERDICT_STYLE: Record<string, { ring: string; text: string; label: string }> = {
  STRUCTURAL_FAILURE: {
    ring: "border-brick-500/50 text-brick-400",
    text: "text-brick-400",
    label: "Structural failure",
  },
  TRANSIENT_VOLATILITY: {
    ring: "border-amber-500/50 text-amber-400",
    text: "text-amber-400",
    label: "Transient volatility",
  },
  MANIPULATION_SUSPECTED: {
    ring: "border-verdigris-500/50 text-verdigris-400",
    text: "text-verdigris-400",
    label: "Manipulation suspected",
  },
};

export function VerdictStamp({
  classification,
  reasoning,
}: {
  classification: string;
  reasoning?: string;
}) {
  const style = VERDICT_STYLE[classification];
  if (!style) return null;

  return (
    <div className="flex items-start gap-4 rounded-lg border border-ink-700 bg-ink-800/40 p-4">
      <div
        className={`grid h-16 w-16 shrink-0 -rotate-6 place-items-center rounded-full border-2 ${style.ring}`}
      >
        <span className="text-center font-display text-[9px] font-semibold uppercase leading-tight tracking-wide">
          {style.label.split(" ")[0]}
        </span>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-600">AI verdict</p>
        <p className={`mt-0.5 font-display text-base font-semibold ${style.text}`}>{style.label}</p>
        {reasoning && <p className="mt-1 text-xs leading-relaxed text-ink-600">{reasoning}</p>}
      </div>
    </div>
  );
}
