/**
 * A semicircular dial spanning [1 - threshold, 1 + threshold], with an
 * optional needle showing the last price actually checked. Unlike a
 * decorative gradient, every part of this encodes something real:
 * the arc's span IS the policy's threshold band, and the needle
 * position IS the last recorded price relative to that band.
 */
export function DeviationGauge({
  thresholdBps,
  lastPriceMicros,
}: {
  thresholdBps: number;
  lastPriceMicros?: number;
}) {
  const threshold = thresholdBps / 10000;
  const lower = 1 - threshold;
  const upper = 1 + threshold;

  const cx = 60;
  const cy = 54;
  const r = 44;

  const needleAngleDeg = (() => {
    if (!lastPriceMicros) return 90; // no reading yet -- point straight up ($1.00)
    const priceUsd = lastPriceMicros / 1_000_000;
    const position = Math.min(1, Math.max(0, (priceUsd - lower) / (upper - lower)));
    return 180 - position * 180;
  })();

  const rad = (needleAngleDeg * Math.PI) / 180;
  const needleX = cx + (r - 8) * Math.cos(rad);
  const needleY = cy - (r - 8) * Math.sin(rad);

  const arcStart = { x: cx - r, y: cy };
  const arcEnd = { x: cx + r, y: cy };

  return (
    <svg viewBox="0 0 120 64" className="w-full max-w-[220px]">
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        className="stroke-ink-700"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* $1.00 tick at the top of the arc */}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy - r + 6} className="stroke-seal-gold" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r="2" className="fill-ink-600" />
      <line
        x1={cx}
        y1={cy}
        x2={needleX}
        y2={needleY}
        className="stroke-verdigris-400"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={needleX} cy={needleY} r="2.5" className="fill-verdigris-400" />
      <text x={arcStart.x} y={cy + 14} className="fill-ink-600" fontSize="7" fontFamily="var(--font-mono)">
        ${lower.toFixed(4)}
      </text>
      <text
        x={arcEnd.x}
        y={cy + 14}
        textAnchor="end"
        className="fill-ink-600"
        fontSize="7"
        fontFamily="var(--font-mono)"
      >
        ${upper.toFixed(4)}
      </text>
      <text x={cx} y={cy - r - 6} textAnchor="middle" className="fill-seal-gold" fontSize="7" fontFamily="var(--font-mono)">
        $1.00
      </text>
    </svg>
  );
}
