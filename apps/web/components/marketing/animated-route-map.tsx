"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { ArrowRight, BadgeCheck, CircleDashed, FileSearch, Radio, ScanSearch, ShieldAlert } from "lucide-react";
import { CurrencyLogo } from "./currency-logo";
import { NetworkLogo } from "./network-logo";
import { CountryFlag } from "./country-flag";
import { ProviderLogo } from "../app/provider-logo";
import { routeMapState, type RouteMapStats } from "./route-map-state";
import type { LandingSignal } from "./landing-data";
import styles from "./corridor-card.module.css";

export type { RouteMapStats } from "./route-map-state";
const STATE_ICONS = { good: BadgeCheck, warn: ShieldAlert, muted: FileSearch, pending: ScanSearch };
const ROUTE_QUERY = "Indian business sending USDC on Base to a UAE bank account receiving AED";
const ROUTE_DESTINATION = `/app/corridors?q=${encodeURIComponent(ROUTE_QUERY)}`;
const DETAILS = `/login?next=${encodeURIComponent(ROUTE_DESTINATION)}`;

/** The illustration describes the request; counts and verdicts come from the evaluated corridor. */
export function AnimatedRouteMap({ stats }: { stats: (RouteMapStats & Pick<LandingSignal, "providerExamples" | "requirements" | "latestVerified">) | null }) {
  const figure = useRef<HTMLElement>(null);
  const visible = useInView(figure, { amount: .2, once: true });
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const state = routeMapState(stats);
  const Icon = stats?.checked === 0 ? CircleDashed : STATE_ICONS[state.tone];
  const confidence = stats?.topConfidence == null ? null : Math.round(stats.topConfidence * 100);
  const eligible = (stats?.supported ?? 0) + (stats?.partial ?? 0);
  return <figure ref={figure} className={styles.card} data-running={visible && !reducedMotion} data-tone={state.tone} aria-label="Live corridor analysis: India, USDC on Base, UAE dirham bank payout" aria-busy={!stats}>
    <figcaption className={styles.header}>
      <div className={styles.headerMeta}><span className={styles.live}><i />Live corridor check</span><span className={styles.scanned}><Radio size={11} aria-hidden />{stats ? `${stats.checked} providers scanned` : "Checking index"}</span></div>
      <div className={styles.routeTitle}><CountryFlag code="IN" size={19} /><span>India</span><ArrowRight size={19} aria-hidden /><strong>United Arab Emirates</strong><CountryFlag code="AE" size={19} /></div>
      <p className={styles.subtitle}>Business payout <span /> USDC on Base <ArrowRight size={10} aria-hidden /> AED</p>
    </figcaption>
    <div className={styles.body}>
      <div className={styles.journey}>
        <div className={styles.track} aria-hidden><span /><ArrowRight size={13} /><ArrowRight size={13} /></div>
        <ol className={styles.stages} aria-label="Route requirements">
          <li><StageLabel step="01" label="Origin" /><div className={styles.node}><CountryFlag code="IN" size={31} /></div><strong>India</strong><p>Business entity</p></li>
          <li><StageLabel step="02" label="Settlement" /><div className={`${styles.node} ${styles.settlement}`}><CurrencyLogo symbol="USDC" size={33} /><NetworkLogo slug="base" size={35} /></div><strong>USDC <span>on</span> Base</strong><p>Asset + network</p></li>
          <li><StageLabel step="03" label="Payout" /><div className={styles.node}><CountryFlag code="AE" size={31} /></div><strong>Dirhams (AED)</strong><p>UAE bank account</p></li>
        </ol>
      </div>
      <div className={styles.checks}>
        <span><BadgeCheck size={13} />{stats?.checked ? "Provider index checked" : "Awaiting provider data"}</span>
        <span><FileSearch size={13} />{stats ? `${stats.evidenceCount} matched sources` : "Sources pending"}</span>
        <span><ScanSearch size={13} />Evidence-led analysis</span>
      </div>
      <div className={styles.report}>
        <div className={styles.verdict}>
          <div className={styles.verdictMain}><span className={styles.statusIcon}><Icon size={19} aria-hidden /></span><div><div className={styles.verdictLabel}><span>Corridor status</span><span className={styles.statusBadge}>{state.eyebrow}</span></div><h2>{state.title}</h2><p>{state.description}</p></div></div>
          <div className={styles.confidence}><span className={styles.label}>Best confidence</span><strong>{confidence === null ? "—" : `${confidence}%`}</strong><div className={styles.confidenceTrack} aria-hidden><span style={{ width: `${confidence ?? 0}%` }} /></div><p>{confidence === null ? "No scored match" : `Based on ${stats?.evidenceCount ?? 0} matched sources`}</p></div>
        </div>
        <div className={styles.details}>
          <div><span className={styles.label}>Providers checked</span><strong className={styles.providerCount}>{stats?.checked ?? "—"}</strong><p>{stats ? `${eligible} with matching coverage` : "Index not yet loaded"}</p><div className={styles.logos} aria-label="Examples of evaluated providers">{stats?.providerExamples?.map((provider) => <ProviderLogo key={provider.slug} slug={provider.slug} name={provider.name} size={23} />)}{(stats?.checked ?? 0) > (stats?.providerExamples?.length ?? 0) && <Link href={DETAILS} aria-label="See all evaluated providers">+{stats!.checked - (stats?.providerExamples?.length ?? 0)}</Link>}</div></div>
          <div><span className={styles.label}>Requirements</span><p className={styles.requirements}>{stats?.requirements?.length ? stats.requirements.join(" · ") : eligible ? "Confirm entity eligibility with each provider." : "Check eligibility and onboarding for your business."}</p><Link href={DETAILS}>View requirements <ArrowRight size={11} /></Link></div>
          <div><span className={styles.label}>Latest source</span><p className={styles.requirements}>{stats?.latestVerified ? "Provider evidence checked" : "Awaiting verification"}</p><p>{stats?.latestVerified ?? "No verified date"}</p><Link href="/changes">View change log <ArrowRight size={11} /></Link></div>
        </div>
      </div>
      <p className={styles.footnote}>Capability analysis. No money is moving.</p>
    </div>
  </figure>;
}

function StageLabel({ step, label }: { step: string; label: string }) {
  return <span className={styles.stageLabel}><span>{step}</span> {label}</span>;
}
