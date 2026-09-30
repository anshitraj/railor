/**
 * A tiny trend line for metric panels. Server-rendered SVG; the stroke draws
 * itself once on first paint (CSS, so reduced-motion collapses it).
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const [lastX, lastY] = points.at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <path d={area} fill="var(--color-orange)" opacity={0.08} />
      <path
        d={line}
        fill="none"
        stroke="var(--color-orange)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="railor-draw"
      />
      <circle cx={lastX} cy={lastY} r={2.4} fill="var(--color-orange)" />
    </svg>
  );
}

/** Buckets timestamps into `days` daily counts ending today (oldest first). */
export function dailyCounts(dates: Date[], days: number, now = Date.now()): number[] {
  const counts = new Array<number>(days).fill(0);
  const dayMs = 86_400_000;
  const end = Math.floor(now / dayMs);
  for (const date of dates) {
    const index = days - 1 - (end - Math.floor(date.getTime() / dayMs));
    if (index >= 0 && index < days) counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}
