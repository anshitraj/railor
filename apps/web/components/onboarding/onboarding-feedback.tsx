"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Code2, Globe2, PartyPopper, Sparkles } from "lucide-react";
import { Flag } from "@railor/ui";
import { RailorMark } from "../brand";
import { ProviderLogo } from "../app/provider-logo";
import styles from "./onboarding.module.css";

const CAPTIONS = [
  ["A little about you. A better starting point.", "Your workspace, shaped around your next move."],
  ["Start where you are.", "Different countries, different providers. Let’s find your fit."],
  ["Your next market is closer.", "Compare prices and explore the routes that matter to you."],
];

export function OnboardingVisual({ step, country, targets }: { step: number; country?: string; targets: string[] }) {
  const reduce = useReducedMotion();
  return <div className={styles.visual}>
    <div className={styles.visualCopy}><span className={styles.eyebrow}><Sparkles size={12} /> MADE FOR YOUR NEXT MOVE</span><p>{CAPTIONS[step]![0]}</p><span>{CAPTIONS[step]![1]}</span></div>
    <div className={styles.routeArt} aria-hidden="true">
      <svg viewBox="0 0 320 110" className={styles.routeLines}><path d="M44 55H142M182 55H276" /><motion.path key={step} d="M44 55H142M182 55H276" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : .7 }} /></svg>
      <motion.span className={styles.countryNode} key={country ?? "world"} initial={reduce ? false : { opacity: 0, scale: .85 }} animate={{ opacity: 1, scale: 1 }}><span>{country ? <Flag code={country} size={22} round /> : <Globe2 size={23} />}</span><small>{country ?? "You"}</small></motion.span>
      <span className={styles.brandNode}><RailorMark size={44} /></span>
      <span className={styles.marketNode}><span>{targets.length ? targets.slice(0, 2).map(code => <Flag key={code} code={code} size={22} round />) : <Globe2 size={23} />}</span><small>{targets.length ? `${targets.length} market${targets.length === 1 ? "" : "s"}` : "Your markets"}</small></span>
      <div className={styles.providerMarks}>{[["wise", "Wise"], ["airwallex", "Airwallex"], ["xflow", "Xflow"]].map(([slug, name]) => <ProviderLogo key={slug} slug={slug!} name={name!} size={23} />)}<span>Explore your options</span></div>
    </div>
  </div>;
}

/** Mounted only after the server confirms that workspace setup succeeded. */
export function OnboardingComplete({ destination, markets }: { destination: string; markets: string[] }) {
  const reduce = useReducedMotion();
  const [celebrating, setCelebrating] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setCelebrating(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);
  const developer = destination.split(/[?#]/)[0] === "/app/developers";
  const targetCount = markets.length;
  return <motion.section className={styles.complete} aria-label="Setup complete" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    {celebrating && !reduce && <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ "--x": `${(i % 2 ? 1 : -1) * (55 + i * 8)}px`, "--y": `${90 + (i * 37) % 160}px`, "--spin": `${(i % 2 ? 1 : -1) * (140 + i * 29)}deg`, "--delay": `${(i % 8) * 32}ms`, "--confetti-color": ["var(--color-orange)", "var(--color-brand)", "var(--color-lime)", "var(--color-ok)"][i % 4] } as CSSProperties} />)}</div>}
    <div className={styles.successArtwork} aria-hidden="true"><PartyPopper className={styles.popperLeft} size={27} /><span className={styles.successMark}><RailorMark size={64} /><span className={styles.successCheck}><Check size={16} strokeWidth={3} /></span></span><PartyPopper className={styles.popperRight} size={27} /></div>
    <span className={styles.eyebrow}>CONGRATULATIONS</span>
    <h1 ref={heading} tabIndex={-1}>You’re all set!</h1>
    <p>Your preferences are saved. Let’s put your next move in focus.</p>
    <div className={styles.successChips}><span><Check size={14} />Preferences saved</span><span>{targetCount ? markets.slice(0, 2).map(code => <Flag key={code} code={code} size={13} />) : <Globe2 size={14} />}{targetCount ? `${targetCount} market${targetCount === 1 ? "" : "s"} to explore` : "Ready to explore"}</span></div>
    <Link href={destination} className={styles.primaryLink}>{developer ? <><Code2 size={17} />Get my API key</> : destination === "/app" ? "Open my workspace" : "Continue to Railor"}<ArrowRight size={17} /></Link>
    <small>Your quick-start guide is waiting on Overview. Open it anytime.</small>
  </motion.section>;
}
