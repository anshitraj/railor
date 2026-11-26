"use client";

import { useState } from "react";
import styles from "./charts.module.css";

const W = 320;
const H = 64;

const shortDay = (day: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** A 30-day mid-market line with a crosshair: hover any day to read its rate. */
export function RateSparkline({ points, pair }: { points: Array<{ date: string; rate: number }>; pair: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const rates = points.map((point) => point.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min || max * 0.001 || 1;
  const x = (index: number) => (index / (points.length - 1)) * W;
  const y = (rate: number) => 4 + (1 - (rate - min) / span) * (H - 8);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.rate).toFixed(1)}`).join(" ");
  const active = hover === null ? null : points[hover];

  return (
    <div className={`${styles.viz} ${styles.spark}`} onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        setHover(Math.round(ratio * (points.length - 1)));
      }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${pair} over ${points.length} days, from ${rates[0]} to ${rates[rates.length - 1]}.`}>
        <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="var(--series-1)" opacity={0.08} />
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {active && hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--axis)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      {active && hover !== null ? (
        <div className={styles.tooltip} style={{ left: `${Math.min(80, Math.max(20, (hover / (points.length - 1)) * 100))}%`, top: -54, minWidth: 120 }}>
          <strong>{shortDay(active.date)}</strong>
          <div className={styles.tooltipRow}><span>{pair}</span><b>{active.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}</b></div>
        </div>
      ) : null}
    </div>
  );
}
