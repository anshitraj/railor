import type { CSSProperties } from "react";
import { Flag } from "@railor/ui";
import styles from "./die-cut-stickers.module.css";

/**
 * Die-cut stickers drawn as vector art: a scalloped seal, a rubber stamp, a
 * torn ticket and a flag pair. Each has a thick white cut line and a soft drop
 * shadow, like the real thing slapped on a laptop. Purely decorative.
 */

type Placement = { tilt?: number; delay?: number; size?: number; className?: string; style?: CSSProperties };

const place = ({ tilt = 0, delay = 0, size }: Placement): CSSProperties =>
  ({ "--tilt": `${tilt}deg`, "--delay": `${delay}s`, ...(size ? { "--size": `${size}px` } : {}) }) as CSSProperties;

/** Points of a scalloped seal, as an SVG path. */
function sealPath(points = 18, outer = 48, inner = 42.5, cx = 50, cy = 50) {
  const steps: string[] = [];
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    steps.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${steps.join("L")}Z`;
}
const SEAL = sealPath();

/** A gold scalloped seal: a big word, a small line under it. */
export function SealSticker({ word, line, tone = "gold", ...placement }: Placement & { word: string; line?: string; tone?: "gold" | "orange" }) {
  return (
    <span className={`${styles.sticker} ${styles.seal} ${placement.className ?? ""}`} data-tone={tone} style={{ ...place(placement), ...placement.style }} aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <path d={SEAL} className={styles.cut} />
        <path d={SEAL} className={styles.sealFill} />
        <circle cx="50" cy="50" r="34" className={styles.sealRing} />
        <text x="50" y={line ? 52 : 57} className={styles.sealWord}>{word}</text>
        {line ? <text x="50" y="66" className={styles.sealLine}>{line}</text> : null}
      </svg>
    </span>
  );
}

/** A round rubber stamp with its words running around the rim and a tick in the middle. */
export function StampSticker({ text, ...placement }: Placement & { text: string }) {
  const id = `stamp-${text.replace(/\W+/g, "-").toLowerCase()}`;
  const ring = `${text} · ${text} · `;
  return (
    <span className={`${styles.sticker} ${styles.stamp} ${placement.className ?? ""}`} style={{ ...place(placement), ...placement.style }} aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <defs><path id={id} d="M50 50 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0" /></defs>
        <circle cx="50" cy="50" r="47" className={styles.cut} />
        <circle cx="50" cy="50" r="47" className={styles.stampFill} />
        <circle cx="50" cy="50" r="42" className={styles.stampRim} />
        <circle cx="50" cy="50" r="24" className={styles.stampRim} />
        <text className={styles.stampText}><textPath href={`#${id}`} textLength="205" lengthAdjust="spacing">{ring}</textPath></text>
        <path d="M39 50.5l7.5 7.5L62 42.5" className={styles.stampTick} />
      </svg>
    </span>
  );
}

/** A torn admission-style ticket: small label, bold line, a strip of barcode. */
export function TicketSticker({ label, text, ...placement }: Placement & { label: string; text: string }) {
  return (
    <span className={`${styles.sticker} ${styles.ticket} ${placement.className ?? ""}`} style={{ ...place(placement), ...placement.style }} aria-hidden="true">
      <span className={styles.ticketBody}>
        <small>{label}</small>
        <strong>{text}</strong>
      </span>
      <span className={styles.ticketStub}><i /><i /><i /><i /><i /><i /><i /></span>
    </span>
  );
}

/** Two flags joined by an arrow: a route, as a sticker. */
export function RouteSticker({ from, to, ...placement }: Placement & { from: string; to: string }) {
  return (
    <span className={`${styles.sticker} ${styles.route} ${placement.className ?? ""}`} style={{ ...place(placement), ...placement.style }} aria-hidden="true">
      <Flag code={from} size={26} round />
      <svg viewBox="0 0 24 12" focusable="false"><path d="M1 6h19m-5-4.5L20.5 6 15 10.5" /></svg>
      <Flag code={to} size={26} round />
    </span>
  );
}
