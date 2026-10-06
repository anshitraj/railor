"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { ArrowRight, ArrowUpRight, BadgeCheck, CircleDashed, FileSearch, Radio, ScanSearch, ShieldAlert } from "lucide-react";
import { CurrencyLogo } from "./currency-logo";
import { NetworkLogo } from "./network-logo";
import { CountryFlag } from "./country-flag";
import { routeMapState, type RouteMapStats } from "./route-map-state";

export type { RouteMapStats } from "./route-map-state";

const STATE_ICONS = { good: BadgeCheck, warn: ShieldAlert, muted: FileSearch, pending: ScanSearch };
const ROUTE_QUERY = "Indian business sending USDC on Base to a UAE bank account receiving AED";
const ROUTE_DESTINATION = `/app/corridors?q=${encodeURIComponent(ROUTE_QUERY)}`;

/** Route requirements are illustrative; coverage and evidence are live, never payment activity. */
export function AnimatedRouteMap({ stats }: { stats: RouteMapStats | null }) {
  const figure = useRef<HTMLElement>(null);
  const visible = useInView(figure, { amount: 0.2 });
  // Start still on the server and listen for preference changes while mounted.
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const state = routeMapState(stats);
  const Icon = stats?.checked === 0 ? CircleDashed : STATE_ICONS[state.tone];
  const confidence = stats?.topConfidence == null ? "—" : `${Math.round(stats.topConfidence * 100)}%`;
  const checked = stats ? stats.checked.toLocaleString("en-US") : "—";
  const evidence = stats ? stats.evidenceCount.toLocaleString("en-US") : "—";

  return (
    <figure ref={figure} className={`corridor-dossier ${visible && !reducedMotion ? "is-running" : ""}`} aria-label="Live corridor analysis: India, USDC on Base, UAE dirham bank payout" aria-busy={!stats}>
      <figcaption className="corridor-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-light)]">
            <span className="size-1.5 rounded-full bg-[var(--color-orange)]" aria-hidden /> Live corridor check
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-white/80">
            <Radio size={12} aria-hidden /> {stats ? `${checked} providers scanned` : "Scanning index"}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <span className="font-display text-[clamp(1.65rem,5cqi,2.2rem)] font-semibold leading-none tracking-[-0.045em]">India</span>
          <ArrowRight size={23} strokeWidth={1.5} aria-hidden className="shrink-0 text-[var(--color-accent-light)]" />
          <span className="font-display text-[clamp(1.65rem,5cqi,2.2rem)] font-semibold leading-none tracking-[-0.045em]">United Arab Emirates</span>
        </div>
        <p className="mt-3 text-[12px] text-white/65">Business payout <span className="mx-2 text-white/30">/</span> USDC on Base <span className="mx-2 text-white/30">→</span> AED</p>
      </figcaption>

      <div className="corridor-journey">
        <div className="corridor-grid" aria-hidden />
        <ol className="corridor-stages" aria-label="Route requirements">
          <li className="corridor-stage">
            <StageLabel step="01" label="Origin" />
            <div className="corridor-node"><CountryFlag code="IN" size={30} /></div>
            <p className="corridor-stage-title">India</p>
            <p className="corridor-stage-detail">Business entity</p>
          </li>
          <li className="corridor-stage">
            <StageLabel step="02" label="Settlement" />
            <div className="corridor-node corridor-settlement">
              <CurrencyLogo symbol="USDC" size={36} />
              <span className="h-7 w-px bg-[var(--color-line)]" aria-hidden />
              <NetworkLogo slug="base" size={40} />
            </div>
            <p className="corridor-stage-title">USDC <span className="font-normal text-[var(--color-muted)]">on</span> Base</p>
            <p className="corridor-stage-detail">Asset + network</p>
          </li>
          <li className="corridor-stage">
            <StageLabel step="03" label="Payout" />
            <div className="corridor-node"><CurrencyLogo symbol="AED" size={34} /></div>
            <p className="corridor-stage-title">Dirhams</p>
            <p className="corridor-stage-detail inline-flex items-center gap-1.5"><CountryFlag code="AE" size={12} /> UAE bank account</p>
          </li>
        </ol>
        <div className="corridor-track" aria-hidden>
          <span className="corridor-packet"><span /></span>
          <ArrowRight size={13} className="absolute left-[27%] -top-1.5 bg-[var(--color-paper)] text-[var(--color-orange-deep)]" />
          <ArrowRight size={13} className="absolute right-[27%] -top-1.5 bg-[var(--color-paper)] text-[var(--color-orange-deep)]" />
        </div>
        <p className="relative mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-[var(--color-muted)]"><ScanSearch size={12} aria-hidden /> Capability analysis. No money is moving.</p>
      </div>

      <div className="corridor-verdict" data-route-state={state.tone}>
        <div className="flex items-start gap-3">
          <span className={`corridor-verdict-icon corridor-tone-${state.tone}`}><Icon size={20} strokeWidth={1.6} aria-hidden /></span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">{state.eyebrow}</p>
            <p className="mt-1.5 font-display text-[18px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-ink)]">{state.title}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">{state.description}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-line)] pt-4">
          <Metric label="Best confidence" value={confidence} detail={confidence === "—" ? "No scored match" : "Highest match"} />
          <Metric label="Evidence" value={evidence} detail={stats?.evidenceCount === 1 ? "Current source" : "Current sources"} />
        </dl>
        <Link href={`/login?next=${encodeURIComponent(ROUTE_DESTINATION)}`} className="mt-5 inline-flex w-full items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3 text-[12px] font-semibold text-[var(--color-orange-deep)] transition-colors hover:text-[var(--color-ink)]">
          Inspect this corridor <ArrowUpRight size={16} aria-hidden />
        </Link>
      </div>
    </figure>
  );
}

function StageLabel({ step, label }: { step: string; label: string }) {
  return <p className="mb-4 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]"><span className="mr-1.5 text-[var(--color-orange-deep)]">{step}</span>{label}</p>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div>
    <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-[var(--color-muted)]">{label}</dt>
    <dd className="mt-1.5 font-display text-[27px] font-semibold leading-none tracking-[-0.04em] text-[var(--color-ink)]">{value}</dd>
    <dd className="mt-1.5 text-[10px] text-[var(--color-muted)]">{detail}</dd>
  </div>;
}
