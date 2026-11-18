"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Coins, Landmark } from "lucide-react";
import { StablecoinHero } from "../../price/stablecoin-hero";
import styles from "./home.module.css";

const TABS = [
  { value: "bank", label: "Bank transfer", Icon: Landmark },
  { value: "stablecoin", label: "Stablecoins", Icon: Coins },
] as const;

/** The hero calculator with a switch between bank transfers and stablecoins. The bank calculator stays mounted so its state survives a switch. */
export function HeroCalculator({ bank, signedIn }: { bank: React.ReactNode; signedIn: boolean }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<(typeof TABS)[number]["value"]>("bank");
  return (
    <div className={styles.calcSwitch}>
      <div role="tablist" aria-label="What are you moving?" className={styles.calcTabs}>
        {TABS.map(({ value, label, Icon }) => (
          <button key={value} type="button" role="tab" id={`hero-tab-${value}`} aria-selected={mode === value} aria-controls={`hero-panel-${value}`} onClick={() => setMode(value)}>
            {mode === value ? <motion.span layoutId="hero-calc-tab" className={styles.calcTabPill} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.32, bounce: 0 }} /> : null}
            <span className={styles.calcTabText}><Icon size={14} aria-hidden />{label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="hero-panel-bank" aria-labelledby="hero-tab-bank" hidden={mode !== "bank"} className={styles.calcPanel}>{bank}</div>
      {mode === "stablecoin" ? (
        <div role="tabpanel" id="hero-panel-stablecoin" aria-labelledby="hero-tab-stablecoin" className={styles.calcPanel}>
          <StablecoinHero signedIn={signedIn} />
        </div>
      ) : null}
    </div>
  );
}
