"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Flag, currencyFlagCode } from "@railor/ui";
import { ArrowUpRight, Pause, Play, Route } from "lucide-react";
import { RailorMark } from "../brand";
import { CurrencyLogo } from "./currency-logo";
import styles from "./rail-artwork.module.css";

const INPUTS = [
  { symbol: "USDC", name: "USD Coin", path: "M154 76 H204 C260 76 242 160 282 160" },
  { symbol: "EUR", name: "Euro", path: "M154 160 H282" },
  { symbol: "GBP", name: "British pound", path: "M154 244 H204 C260 244 242 160 282 160" },
];
const OUTPUTS = [
  { symbol: "AED", name: "UAE dirham", path: "M358 160 C402 160 384 76 436 76 H486" },
  { symbol: "USD", name: "US dollar", path: "M358 160 H486" },
  { symbol: "INR", name: "Indian rupee", path: "M358 160 C402 160 384 244 436 244 H486" },
];

function CurrencyNode({ symbol, name }: { symbol: string; name: string }) {
  const flag = currencyFlagCode(symbol);
  return <>
    <span className={styles.currencyIcon} aria-hidden="true">
      {flag ? <Flag code={flag} size={30} round /> : <CurrencyLogo symbol={symbol} size={30} />}
    </span>
    <span className={styles.currencyLabel}><strong>{symbol}</strong><span>{name}</span></span>
  </>;
}

/** An illustrative route map, with a pausable signal flowing through the brand hub. */
export function RailArtwork() {
  const artworkRef = useRef<HTMLElement>(null);
  const inView = useInView(artworkRef, { amount: 0.15 });
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  return (
    <figure ref={artworkRef} className={styles.artwork} data-running={inView && !reduced && !paused}>
      <figcaption className={styles.header}>
        <span className={styles.heading}><Route size={15} aria-hidden="true" /> One view. Every route.</span>
        <span className={styles.caption}>Illustrative map</span>
      </figcaption>
      <div className={styles.stage} role="img" aria-label="Illustration of USDC, euros and British pounds flowing through Railor to UAE dirhams, US dollars and Indian rupees. This is not a statement of route availability.">
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.orbit} aria-hidden="true" />
        <svg className={styles.rails} viewBox="0 0 640 320" fill="none" aria-hidden="true">
          {[...INPUTS, ...OUTPUTS].map((rail, index) => <g key={rail.symbol}>
            <path d={rail.path} className={styles.track} />
            <path d={rail.path} pathLength="100" className={styles.signal} style={{ animationDelay: `${(index % 3) * 1.4 + (index > 2 ? 2 : 0)}s` }} />
          </g>)}
        </svg>
        <div className={`${styles.nodes} ${styles.inputs}`} aria-hidden="true">
          {INPUTS.map((rail) => <div key={rail.symbol} className={styles.node}><CurrencyNode {...rail} /></div>)}
        </div>
        <div className={styles.hub} aria-hidden="true">
          <span className={styles.hubEyebrow}>Connect the dots</span>
          <span className={styles.brand}><RailorMark size={66} /></span>
          <strong>Railor</strong>
          <span className={styles.hubCaption}>Financial infrastructure, mapped</span>
        </div>
        <div className={`${styles.nodes} ${styles.outputs}`} aria-hidden="true">
          {OUTPUTS.map((rail) => <div key={rail.symbol} className={styles.node}><CurrencyNode {...rail} /><ArrowUpRight className={styles.nodeArrow} size={13} /></div>)}
        </div>
      </div>
      <div className={styles.footer}>
        <span>Different currencies. <strong>One clear picture.</strong></span>
        {!reduced && <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Play route animation" : "Pause route animation"} aria-pressed={paused} className={styles.motionControl}>
          {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>}
      </div>
    </figure>
  );
}
