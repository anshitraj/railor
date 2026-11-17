"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Code2, Globe2, PartyPopper } from "lucide-react";
import { Flag } from "@railor/ui";
import { RailorMark } from "../brand";
import { ProviderLogo } from "../app/provider-logo";
import styles from "./onboarding.module.css";

/**
 * A live preview of the workspace being set up: each answer lands on the card
 * as it is chosen, so people can see what their choices change.
 */
export function WorkspacePreview({ step, profile, country, targets, api }: {
  step: number;
  profile?: string;
  country?: { code: string; name: string };
  targets: Array<{ code: string; name: string }>;
  api: boolean;
}) {
  return <aside className={styles.preview} aria-label="Your workspace preview">
    <div className={styles.previewHead}><RailorMark size={26} /><div><strong>Your workspace</strong><small>Updates as you answer</small></div></div>
    <dl className={styles.previewList}>
      <div data-active={step === 0 || undefined}>
        <dt>Using Railor for</dt>
        <dd>{profile ? <span key={profile} className={`sticker ${styles.previewValue}`} data-tone="ink" style={{ "--tilt": "-2deg" } as CSSProperties}><Check size={13} />{profile}</span> : <span className={styles.previewEmpty}>Not chosen yet</span>}</dd>
      </div>
      <div data-active={step === 1 || undefined}>
        <dt>Based in</dt>
        <dd>{country ? <span key={country.code} className={styles.previewCountry}><span className="sticker-flag" style={{ "--tilt": "-6deg" } as CSSProperties}><Flag code={country.code} size={26} round /></span>{country.name}</span> : <span className={styles.previewEmpty}>Not chosen yet</span>}</dd>
      </div>
      <div data-active={step === 2 || undefined}>
        <dt>Sending to</dt>
        <dd>{targets.length ? <span className={styles.previewFlags}>{targets.slice(0, 5).map((target, index) => <span key={target.code} className="sticker-flag" title={target.name} style={{ "--tilt": `${index % 2 ? 6 : -6}deg`, "--delay": `${index * 0.05}s` } as CSSProperties}><Flag code={target.code} size={24} round /></span>)}{targets.length > 5 ? <em>+{targets.length - 5}</em> : null}</span> : <span className={styles.previewEmpty}>Pick one or more markets</span>}</dd>
      </div>
    </dl>
    <div className={styles.previewRoutes}>
      <p>Routes you’ll see first</p>
      {country && targets.length ? <ul>{targets.slice(0, 3).map((target) => <li key={target.code}><Flag code={country.code} size={18} round /><span aria-hidden>→</span><Flag code={target.code} size={18} round /><span>{country.name} to {target.name}</span></li>)}</ul> : <span className={styles.previewEmpty}>Choose a country and a market to see them here.</span>}
    </div>
    {api ? <p className={styles.previewApi}><Code2 size={15} />An API key will be ready on the next screen</p> : null}
    <div className={styles.previewProviders} aria-hidden><ProviderLogo slug="wise" name="Wise" size={22} /><ProviderLogo slug="remitly" name="Remitly" size={22} /><ProviderLogo slug="skydo" name="Skydo" size={22} /><ProviderLogo slug="airwallex" name="Airwallex" size={22} /><span>and more, compared for you</span></div>
  </aside>;
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
    <h1 ref={heading} tabIndex={-1}>You’re all set!</h1>
    <p>Your preferences are saved. Let’s put your next move in focus.</p>
    <div className={styles.successChips}><span><Check size={14} />Preferences saved</span><span>{targetCount ? markets.slice(0, 2).map(code => <Flag key={code} code={code} size={13} />) : <Globe2 size={14} />}{targetCount ? `${targetCount} market${targetCount === 1 ? "" : "s"} to explore` : "Ready to explore"}</span></div>
    <Link href={destination} className={styles.primaryLink}>{developer ? <><Code2 size={17} />Get my API key</> : destination === "/app" ? "Open my workspace" : "Continue to Railor"}<ArrowRight size={17} /></Link>
    <small>Your quick-start guide is waiting on Overview. Open it anytime.</small>
  </motion.section>;
}
