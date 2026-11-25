import { GLOBE_ARCS, GLOBE_NODES, GLOBE_SIZE } from "./globe-dots";
import styles from "./home.module.css";

const USED = new Set<string>(GLOBE_ARCS.flatMap((arc) => [arc.from, arc.to]));

/**
 * The hero's backdrop: a dotted globe with the corridors Railor prices most
 * drawn across it. The dots are a cached image; only the arcs are inline, so
 * they can draw in and carry a moving light from sender to recipient.
 * Purely decorative, and still when motion is reduced.
 */
export function HeroGlobe() {
  return (
    <div className={styles.globe} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static decorative SVG; nothing to optimise */}
      <img className={styles.globeDots} src="/images/globe-dots.svg" alt="" width={GLOBE_SIZE} height={GLOBE_SIZE} decoding="async" />
      <svg className={styles.globeArcs} viewBox={`0 0 ${GLOBE_SIZE} ${GLOBE_SIZE}`} focusable="false">
        <defs>
          <linearGradient id="hero-arc-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-orange)" stopOpacity=".25" />
            <stop offset=".5" stopColor="var(--color-orange)" stopOpacity=".9" />
            <stop offset="1" stopColor="var(--color-orange)" stopOpacity=".35" />
          </linearGradient>
        </defs>
        {GLOBE_ARCS.map((arc, index) => (
          <g key={`${arc.from}-${arc.to}`} style={{ "--arc-delay": `${0.25 + index * 0.22}s`, "--comet-delay": `${1.2 + index * 0.9}s` } as React.CSSProperties}>
            <path className={styles.globeArc} d={arc.d} pathLength={1} stroke="url(#hero-arc-fade)" />
            <path className={styles.globeComet} d={arc.d} pathLength={1} />
          </g>
        ))}
        {GLOBE_NODES.filter((node) => USED.has(node.code)).map((node, index) => (
          <g key={node.code} transform={`translate(${node.x} ${node.y})`} opacity={0.55 + node.depth * 0.45}>
            <circle className={styles.globeHalo} r="11" style={{ "--halo-delay": `${index * 0.4}s` } as React.CSSProperties} />
            <circle className={styles.globeNode} r="4.2" />
          </g>
        ))}
      </svg>
    </div>
  );
}
