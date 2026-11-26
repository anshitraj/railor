"use client";

import { useState } from "react";
import type { Share } from "../../../lib/dashboard-metrics";
import styles from "./charts.module.css";

export interface DonutView { id: string; label: string; unit: string; shares: Share[]; empty: string }

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const R = 64;
const STROKE = 20;
const C = 2 * Math.PI * R;
const GAP = 3;

const colorOf = (share: Share, index: number) => (share.key === "other" ? "var(--series-other)" : COLORS[index] ?? "var(--series-other)");

/** A part-to-whole donut with a legend that carries every count and share, so no slice is identified by colour alone. */
export function ShareDonut({ views }: { views: DonutView[] }) {
  const [active, setActive] = useState(() => views.find((view) => view.shares.length)?.id ?? views[0]!.id);
  const [hover, setHover] = useState<string | null>(null);
  const view = views.find((entry) => entry.id === active) ?? views[0]!;
  const total = view.shares.reduce((sum, share) => sum + share.count, 0);
  let offset = 0;

  return (
    <div className={`${styles.viz} ${styles.donutHost}`}>
      {views.length > 1 ? (
        <div className={styles.switch} role="group" aria-label="Show breakdown of">
          {views.map((entry) => <button key={entry.id} type="button" aria-pressed={entry.id === view.id} onClick={() => { setActive(entry.id); setHover(null); }}>{entry.label}</button>)}
        </div>
      ) : null}
      {total ? (
        <div className={styles.donutWrap} style={{ marginTop: 14 }}>
          <div className={styles.donut} onMouseLeave={() => setHover(null)}>
            <svg viewBox="0 0 168 168" role="img" aria-label={`${view.label}: ${view.shares.map((share) => `${share.label} ${share.count}`).join(", ")}.`}>
              <circle cx={84} cy={84} r={R} fill="none" stroke="var(--color-canvas)" strokeWidth={STROKE} />
              {view.shares.map((share, index) => {
                const length = (share.count / total) * C;
                const dash = view.shares.length > 1 ? Math.max(0.5, length - GAP) : length;
                const segment = (
                  <circle key={share.key} data-seg cx={84} cy={84} r={R} fill="none" stroke={colorOf(share, index)}
                    strokeWidth={hover === share.key ? STROKE + 4 : STROKE} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
                    opacity={hover && hover !== share.key ? 0.45 : 1} onMouseEnter={() => setHover(share.key)} />
                );
                offset += length;
                return segment;
              })}
            </svg>
            <div className={styles.donutCenter}>
              {(() => {
                const focus = view.shares.find((share) => share.key === hover);
                return focus
                  ? <><b>{Math.round((focus.count / total) * 100)}%</b><span>{focus.label}</span></>
                  : <><b>{total.toLocaleString("en-US")}</b><span>{view.unit}</span></>;
              })()}
            </div>
          </div>
          <ul className={styles.shares}>
            {view.shares.map((share, index) => (
              <li key={share.key} className={styles.share} data-active={hover === share.key} onMouseEnter={() => setHover(share.key)} onMouseLeave={() => setHover(null)}>
                <i className={styles.swatch} style={{ background: colorOf(share, index) }} />
                <span>{share.label}</span>
                <b>{share.count.toLocaleString("en-US")}</b>
                <em>{Math.round((share.count / total) * 100)}%</em>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={styles.donutWrap} style={{ marginTop: 14 }}>
          <div className={styles.donut}>
            <svg viewBox="0 0 168 168" aria-hidden><circle cx={84} cy={84} r={R} fill="none" stroke="var(--color-canvas)" strokeWidth={STROKE} /></svg>
            <div className={styles.donutCenter}><b>0</b><span>{view.unit}</span></div>
          </div>
          <p style={{ color: "var(--color-muted)", fontSize: 13, lineHeight: 1.5 }}>{view.empty}</p>
        </div>
      )}
    </div>
  );
}
