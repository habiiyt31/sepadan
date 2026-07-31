export function SealMark({ size = 28, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={spin ? "animate-[spin_3s_linear_infinite]" : undefined}
    >
      <rect width="32" height="32" rx="7" className="fill-ink-800" />
      <circle cx="16" cy="16" r="12.5" className="stroke-verdigris-500" strokeWidth="1.4" fill="none" />
      <circle cx="16" cy="16" r="9.2" className="stroke-seal-gold" strokeWidth="0.6" fill="none" />
      <line x1="16" y1="16" x2="16" y2="8" className="stroke-verdigris-400" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.4" className="fill-verdigris-400" />
    </svg>
  );
}
