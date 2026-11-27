"use client";

import { useEffect, useRef, useState } from "react";
import type { DayPoint } from "../../../lib/dashboard-metrics";
import styles from "./charts.module.css";

const SERIES = [
  { key: "checks", label: "Price checks", color: "var(--series-1)" },
  { key: "visits", label: "Provider visits", color: "var(--series-2)" },
  { key: "payments", label: "Payments", color: "var(--series-3)" },
] as const;

const PAD = { top: 8, right: 6, bottom: 24, left: 30 };
const GAP = 2;

const shortDay = (day: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** The smallest of 2, 4, 5, 10 … that clears the tallest bar, so gridlines land on whole numbers. */
function niceMax(value: number) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return value;
}

/** Stacked daily bars: what the workspace did each day. One axis, three series, a tooltip per day. */
export function ActivityChart({ points: allPoints }: { points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the real width so text stays 11px; a phone shows the last 14 days.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setW(Math.max(280, Math.round(entry.contentRect.width))); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const points = W < 520 ? allPoints.slice(-14) : allPoints;
  const H = W < 520 ? 200 : 220;
  const totals = points.map((point) => point.checks + point.visits + point.payments);
  const sums = SERIES.map((series) => allPoints.reduce((sum, point) => sum + point[series.key], 0));
  const empty = totals.every((total) => total === 0);
  const max = niceMax(Math.max(1, ...totals));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / points.length;
  const barW = Math.max(3, Math.min(16, slot - 4));
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelDays = [0, Math.floor(points.length / 2), points.length - 1];
  const point = hover === null ? null : points[hover];

  return (
    <div className={styles.viz}>
      <div className={styles.legend}>
        {SERIES.map((series, index) => (
          <span key={series.key} className={styles.legendItem}><i className={styles.swatch} style={{ background: series.color }} />{series.label} <b>{sums[index]!.toLocaleString("en-US")}</b></span>
        ))}
      </div>
      <div ref={box} className={styles.plot} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Activity over the last ${points.length} days: ${SERIES.map((series, index) => `${sums[index]} ${series.label.toLowerCase()}`).join(", ")}.`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className={styles.tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</text>
            </g>
          ))}
          {points.map((day, index) => {
            const x = PAD.left + index * slot + (slot - barW) / 2;
            let base = 0;
            return (
              <g key={day.day}>
                {hover === index ? <rect className={styles.hoverBand} x={PAD.left + index * slot} y={PAD.top} width={slot} height={plotH} rx={4} /> : null}
                {SERIES.map((series) => {
                  const value = day[series.key];
                  if (!value) return null;
                  const top = y(base + value);
                  const height = Math.max(1, y(base) - top - (base > 0 ? GAP : 0));
                  base += value;
                  return <rect key={series.key} className={styles.bar} style={{ "--d": index } as React.CSSProperties} x={x} y={top} width={barW} height={height} rx={Math.min(3, barW / 2)} fill={series.color} />;
                })}
                <rect className={styles.hit} x={PAD.left + index * slot} y={PAD.top} width={slot} height={plotH} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} />
              </g>
            );
          })}
          {labelDays.map((index) => (
            <text key={index} x={PAD.left + index * slot + slot / 2} y={H - 6} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className={styles.tick}>{shortDay(points[index]!.day)}</text>
          ))}
        </svg>
        {point && hover !== null ? (
          <div className={styles.tooltip} style={{ left: `${Math.min(86, Math.max(14, ((PAD.left + hover * slot + slot / 2) / W) * 100))}%` }}>
            <strong>{shortDay(point.day)}</strong>
            {SERIES.map((series) => (
              <div key={series.key} className={styles.tooltipRow}><span><i className={styles.swatch} style={{ background: series.color }} />{series.label}</span><b>{point[series.key]}</b></div>
            ))}
          </div>
        ) : null}
        {empty ? (
          <div className={styles.emptyPlot}>
            <strong>Your activity shows up here</strong>
            <span>Each price check, provider you go to and payment you make is counted by day.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
