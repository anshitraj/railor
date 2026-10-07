"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Radar,
  Route,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { AnimatedRouteMap } from "./animated-route-map";
import { EvidenceFolio } from "./evidence-folio";
import { CurrencyLogo, type CurrencySymbol } from "./currency-logo";
import { CountryFlag, type CountryCode } from "./country-flag";
import { HeroSearch } from "./hero-search";
import type { LandingChange, LandingEvidence, LandingSignal } from "./landing-data";
import { RailsStrip } from "./rails-strip";
import {
  CodeSample,
  TechnologyLogo,
  CommandBlock,
  CountUp,
  Reveal,
  Stagger,
  StaggerItem,
  StageBadge,
  type PickerOption,
} from "@railor/ui";

type LandingProps = {
  counts: { providers: number; countries: number; sources: number; capabilities: number };
  surveyProviderCount: number;
  optionsByField: Record<string, PickerOption[]>;
  fieldLabels: Record<string, string>;
  signals: LandingSignal[];
  changes: LandingChange[];
  evidence: LandingEvidence | null;
};

function signalStatus(signal: LandingSignal): { label: string; tone: "good" | "warn" | "muted" } {
  if (signal.supported > 0) return { label: `${signal.supported} compatible`, tone: "good" };
  if (signal.partial > 0) return { label: `${signal.partial} need KYB`, tone: "warn" };
  return { label: "No verified route", tone: "muted" };
}

const PLATFORM_PATH: Array<[string, "live" | "beta" | "soon"]> = [
  ["Discover", "live"],
  ["Verify", "live"],
  ["Monitor", "live"],
  ["Connect", "beta"],
  ["Route", "beta"],
];

const layers = [
  ["01", "Discover", "Search markets, rails and providers in the language your team actually uses.", ScanSearch],
  ["02", "Verify", "Every important claim resolves to a source, a confidence level and a date.", ShieldCheck],
  ["03", "Monitor", "See the moment a limit, route or requirement changes beneath your integration.", Radar],
] as const;

export function MarketingLanding({ counts, surveyProviderCount, optionsByField, fieldLabels, signals, changes, evidence }: LandingProps) {
  return (
    <div className="overflow-hidden">
      <section className="border-b border-[var(--color-line)] bg-[var(--color-ink)] text-[var(--color-paper)]">
        <div className="mx-auto flex w-[min(1360px,calc(100%-2rem))] items-center justify-between gap-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px]">
          <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-[var(--color-orange)]" />Railor Intelligence Index</span>
          <span className="hidden text-white/55 sm:block">Infrastructure facts change. Your map should too.</span>
          <Link href="/changes" className="inline-flex items-center gap-1 text-[var(--color-paper)] transition hover:text-[var(--color-orange)]">Live change feed <ArrowUpRight size={13} /></Link>
        </div>
      </section>

      <main id="main">
        <section className="relative border-b border-[var(--color-line)] bg-[var(--color-paper)]">
          <div className="railor-rule pointer-events-none absolute inset-x-0 top-0 h-full opacity-50" aria-hidden />
          <div className="relative mx-auto w-[min(1360px,calc(100%-2rem))] pb-10 pt-14 lg:pb-14 lg:pt-20">
            <div className="railor-rise grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
              <div className="relative z-10 min-w-0 max-w-[760px] pb-2">
                <p className="mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-orange-deep)]">
                  <span className="h-px w-8 bg-[var(--color-orange)]" /> Financial infrastructure, mapped
                </p>
                <h1 className="font-display text-[clamp(3.35rem,6.4vw,7rem)] font-medium leading-[0.9] tracking-[-0.07em] text-[var(--color-ink)]">
                  Know which stablecoin rail<br />
                  <span className="text-[var(--color-orange)]">actually works.</span>
                </h1>
                <p className="mt-5 max-w-[600px] text-[16px] leading-[1.55] text-[var(--color-muted)] sm:text-[18px]">
                  Check provider compatibility, requirements and infrastructure health before you integrate.
                </p>
                <div className="mt-7 rounded-[24px] border border-[var(--color-line)] bg-[var(--color-sand)] p-3 sm:p-4">
                  <HeroSearch optionsByField={optionsByField} fieldLabels={fieldLabels} />
                </div>
              </div>

              <div className="railor-rise min-w-0 [animation-delay:120ms]">
                <AnimatedRouteMap stats={signals.find((x) => x.sourceCode === "IN" && x.destinationCode === "AE") ?? null} />
              </div>
            </div>

            <Stagger className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4" step={0.07}>
              {[
                [counts.providers, "providers mapped"],
                [counts.countries, "markets indexed"],
                [counts.sources, "sources monitored"],
                [counts.capabilities, "facts structured"],
              ].map(([value, label]) => (
                <StaggerItem key={label as string} className="group bg-[var(--color-paper)] px-5 py-5 transition-colors duration-200 hover:bg-[var(--color-lavender)] sm:px-6">
                  <p className="font-display text-[32px] font-medium leading-none tracking-[-0.055em] text-[var(--color-ink)]">
                    <CountUp value={value as number} />
                  </p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)] transition-colors duration-200 group-hover:text-[var(--color-orange-deep)]">{label}</p>
                </StaggerItem>
              ))}
            </Stagger>

            <Link href="/providers" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-3 text-[13px] transition hover:border-[var(--color-orange)]">
              <span><strong className="text-[var(--color-ink)]">{surveyProviderCount} surveyed fee providers</strong><span className="text-[var(--color-muted)]"> · Dated public samples across receiving countries</span></span>
              <span className="font-semibold text-[var(--color-orange-deep)]">Explore fees →</span>
            </Link>

            <Reveal className="mt-2">
              <RailsStrip />
            </Reveal>

            <Reveal delay={0.05} className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
              <CommandBlock
                label="Or query it from your terminal"
                command="railor corridors search --entity IN --to AE --asset USDC --currency AED"
              />
              <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">
                Every screen here is a thin client over the same public API.{" "}
                <Link href="/docs/api" className="font-semibold text-[var(--color-orange-deep)] underline decoration-[var(--color-orange)]/40 underline-offset-2 transition hover:decoration-[var(--color-orange)]">
                  Read the API docs
                </Link>
                .
              </p>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-[var(--color-line)] bg-[var(--color-sand)] py-20 sm:py-28">
          <div className="mx-auto w-[min(1360px,calc(100%-2rem))]">
            <Reveal duration={0.65} className="grid gap-10 lg:grid-cols-[0.87fr_1.13fr] lg:items-end">
              <div>
                <p className="section-kicker">A better picture of the world</p>
                <h2 className="mt-4 max-w-xl font-display text-[clamp(2.75rem,5vw,5.3rem)] font-medium leading-[0.91] tracking-[-0.065em]">Don&apos;t ask who&apos;s biggest. Ask what works.</h2>
              </div>
              <p className="max-w-xl text-[17px] leading-[1.58] text-[var(--color-muted)]">A provider directory can tell you who exists. Railor tells you who can serve this route, for this entity, under these requirements—right now.</p>
            </Reveal>

            <Reveal duration={0.65} className="mt-12 overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[var(--color-ink)] text-[var(--color-paper)]">
              <div className="grid border-b border-white/10 px-5 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 sm:grid-cols-[1.4fr_1fr_1fr_1fr_1.1fr] sm:px-7">
                <span>Route request</span><span className="hidden sm:block">Providers checked</span><span className="hidden sm:block">Destination</span><span className="hidden sm:block">Best confidence</span><span className="hidden text-right sm:block">Live verdict</span>
              </div>
              {signals.map((signal) => {
                const status = signalStatus(signal);
                return (
                  <div
                    key={`${signal.source}-${signal.asset}-${signal.destinationCode}`}
                    className="grid items-center gap-3 border-b border-white/10 px-5 py-5 transition-colors last:border-b-0 hover:bg-white/[0.04] sm:grid-cols-[1.4fr_1fr_1fr_1fr_1.1fr] sm:px-7"
                  >
                    <div className="flex items-center gap-2 text-[14px] font-semibold"><Route size={16} className="text-[var(--color-orange)]" /> <CountryFlag code={signal.sourceCode} size={17} /> {signal.source} <span className="text-white/35">→</span> <CurrencyLogo symbol={signal.asset} size={18} /> {signal.asset}</div>
                    <span className="hidden text-[13px] tabular text-white/65 sm:block">{signal.checked} {signal.checked === 1 ? "provider" : "providers"}</span>
                    <span className="hidden items-center gap-2 text-[13px] text-white/65 sm:flex"><CountryFlag code={signal.destinationCode} size={16} /> {signal.destination} · {signal.fiat}</span>
                    <span className="hidden text-[13px] tabular text-white/65 sm:block">{signal.topConfidence === null ? "Unknown" : signal.topConfidence.toFixed(2)}</span>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] sm:ml-auto ${status.tone === "good" ? "bg-[var(--color-orange)] text-[var(--color-ink)]" : status.tone === "warn" ? "bg-amber-300 text-[var(--color-ink)]" : "bg-white/10 text-white/70"}`}>{status.label}</span>
                  </div>
                );
              })}
            </Reveal>
          </div>
        </section>

        <section className="bg-[var(--color-paper)] py-20 sm:py-28">
          <div className="mx-auto w-[min(1360px,calc(100%-2rem))]">
            <Reveal duration={0.65} className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div><p className="section-kicker">From search to signal</p><h2 className="mt-4 max-w-2xl font-display text-[clamp(2.75rem,5vw,5.3rem)] font-medium leading-[0.91] tracking-[-0.065em]">One working map. No blind spots.</h2></div>
              <Link href="/company/trust" className="group inline-flex items-center gap-1 text-[13px] font-bold uppercase tracking-[0.11em] text-[var(--color-ink)]">How Railor treats evidence <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
            </Reveal>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {layers.map(([number, title, copy, Icon], index) => (
                <Reveal as="article" key={title} duration={0.65} delay={index * 0.08} className="group relative min-h-[310px] overflow-hidden rounded-[26px] border border-[var(--color-line)] bg-[var(--color-paper)] p-6 transition-colors hover:bg-[var(--color-sand)] sm:p-8">
                  <span className="font-display text-[64px] leading-none tracking-[-0.06em] text-[var(--color-orange)]">{number}</span>
                  <Icon size={26} strokeWidth={1.5} className="absolute right-7 top-8 text-[var(--color-orange)]" />
                  <div className="absolute bottom-7 left-7 right-7 sm:bottom-8 sm:left-8 sm:right-8"><h3 className="font-display text-[31px] font-medium tracking-[-0.05em]">{title}</h3><p className="mt-3 max-w-xs text-[14px] leading-[1.55] text-[var(--color-muted)]">{copy}</p></div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.1} className="mt-6 flex flex-wrap items-center gap-2 rounded-[22px] border border-[var(--color-line)] bg-[var(--color-sand)] px-5 py-4">
              <span className="mr-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">Platform path</span>
              {PLATFORM_PATH.map(([step, stage], index) => (
                <span key={step} className="inline-flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] ${stage === "live" ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-dashed border-[var(--color-line-strong)] text-[var(--color-muted)]"}`}>
                    {step}
                    {stage !== "live" ? <StageBadge stage={stage} /> : null}
                  </span>
                  {index < PLATFORM_PATH.length - 1 ? <span aria-hidden className="text-[var(--color-faint)]">→</span> : null}
                </span>
              ))}
              <Link href="/company/roadmap" className="ml-auto text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-orange-deep)] underline decoration-[var(--color-orange)]/40 underline-offset-4">
                Roadmap
              </Link>
            </Reveal>
          </div>
        </section>

        {evidence ? (
          <section id="evidence" aria-labelledby="evidence-heading" className="border-t border-[var(--color-line)] bg-[var(--color-paper)] py-16 sm:py-24">
            <div className="mx-auto grid w-[min(1360px,calc(100%-2rem))] gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
              <Reveal duration={0.65}>
                <p className="section-kicker">Evidence, not vibes</p>
                <h2 id="evidence-heading" className="mt-5 max-w-[14ch] font-display text-[clamp(2.4rem,4vw,4rem)] font-medium leading-[1.02] tracking-[-0.055em]">Every answer,<br />backed by a source.</h2>
                <p className="mt-6 max-w-[35ch] text-[15px] leading-[1.75] text-[var(--color-muted)]">
                  A real capability from Railor&apos;s index. See the source, when it was checked, and how much confidence the evidence deserves.
                </p>
                <p className="mt-6 flex items-start gap-3 text-[12px] leading-relaxed text-[var(--color-muted)]"><span aria-hidden className="mt-2 h-px w-6 shrink-0 bg-[var(--color-orange)]" />Confidence decays with age. The source stays inspectable.</p>
                <Link href="/company/trust" className="group mt-7 inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--color-ink)]">Inside the evidence model <ArrowUpRight size={14} aria-hidden className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
              </Reveal>
              <EvidenceFolio evidence={evidence} />
            </div>
          </section>
        ) : null}

        <section className="border-t border-[var(--color-line)] bg-[var(--color-sand)] py-20 text-[var(--color-ink)] sm:py-28">
          <Reveal duration={0.65} className="mx-auto grid w-[min(1360px,calc(100%-2rem))] gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="section-kicker">Always watching</p>
              <h2 className="mt-4 max-w-xl font-display text-[clamp(2.75rem,5.4vw,5.6rem)] font-medium leading-[0.9] tracking-[-0.07em]">Because the world doesn&apos;t hold still.</h2>
              <p className="mt-6 max-w-md text-[16px] leading-[1.6] text-[var(--color-muted)]">Your route may still exist tomorrow. Its requirements, limits or network support might not. Monitor the facts that move your business.</p>
              <Link href="/login?intent=start" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-3 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">Monitor a route <Radar size={17} /></Link>
            </div>
            <div className="overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[var(--color-paper)]">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4 sm:px-6"><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">Intelligence feed</span><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-orange-deep)]"><span className="size-1.5 rounded-full bg-[var(--color-orange)]" /> Listening</span></div>
              {changes.length ? changes.map((change, index) => (
                <Reveal key={change.id} direction="left" delay={0.18 + index * 0.12} className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-[var(--color-line)] px-5 py-5 last:border-0 sm:px-6">
                  <span className="relative mt-1.5 flex size-2">
                    {index === 0 ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-orange)] opacity-60" /> : null}
                    <span className="relative inline-flex size-2 rounded-full bg-[var(--color-orange)]" />
                  </span>
                  <div className="min-w-0"><p className="text-[14px] font-semibold">{change.provider}<span className="mx-2 text-[var(--color-faint)]">/</span>{change.kind}</p><p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-muted)]">{change.summary}</p></div>
                  <span className="whitespace-nowrap text-[11px] text-[var(--color-faint)]">{change.when}</span>
                </Reveal>
              )) : (
                <p className="px-5 py-8 text-[13px] leading-relaxed text-[var(--color-muted)] sm:px-6">No changes detected yet. When a monitored source moves, the diff lands here with its evidence.</p>
              )}
              <Link href="/changes" className="flex items-center justify-between px-5 py-4 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-orange-deep)] transition hover:bg-[var(--color-lavender)] sm:px-6">Open full change feed <ArrowUpRight size={15} /></Link>
            </div>
          </Reveal>
        </section>

        <section className="border-t border-[var(--color-line)] bg-[var(--color-sand)] py-20 sm:py-28">
          <div className="mx-auto grid w-[min(1360px,calc(100%-2rem))] gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <Reveal duration={0.65} className="flex flex-col gap-4">
              <p className="section-kicker">Built API-first</p>
              <h2 className="max-w-lg font-display text-[clamp(2.75rem,5vw,5.3rem)] font-medium leading-[0.91] tracking-[-0.065em]">
                Every screen here is a thin client.
              </h2>
              <p className="max-w-lg text-[15px] leading-relaxed text-[var(--color-muted)]">
                A test key exists the moment your workspace does. The docs render with it, so nothing
                below is a hypothetical.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "REST", stage: "beta" as const },
                  { label: "TypeScript", stage: "beta" as const },
                  { label: "Python", stage: "beta" as const },
                  { label: "MCP", stage: "beta" as const },
                ].map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-[13px]"
                  >
                    <TechnologyLogo name={item.label} size={21} />
                    {item.label}
                    <StageBadge stage={item.stage} />
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal duration={0.65} delay={0.08}>
              <CodeSample
                variants={[
                  {
                    language: "ts",
                    label: "TypeScript",
                    code: `import { Railor } from "@railor/sdk"

const railor = new Railor({ apiKey: "RAILOR_API_KEY" })

const routes = await railor.corridors.search({
  entityCountry: "IN",
  destinationCountry: "AE",
  sourceAsset: "USDC",
  destinationCurrency: "AED",
  customerType: "business",
})

routes.data[0]
// {
//   provider: { slug: "ramp-network", name: "Ramp Network" },
//   eligibility: "unknown",
//   confidence: 0.83,
//   connectivity: "discovered",
//   ranking_confidence: 0.2,
//   last_verified_at: "2026-08-28T05:43:21.397Z"
// }`,
                  },
                  {
                    language: "curl",
                    label: "cURL",
                    code: `curl ${process.env.NEXT_PUBLIC_APP_URL ?? "https://your-deployment.vercel.app"}/v1/corridors/search \\
  -H "Authorization: Bearer RAILOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_country": "IN",
    "destination_country": "AE",
    "source_asset": "USDC",
    "destination_currency": "AED",
    "customer_type": "business"
  }'`,
                  },
                  {
                    language: "python",
                    label: "Python",
                    code: `from railor import Railor

railor = Railor(api_key="RAILOR_API_KEY")

routes = railor.corridors.search(
    entity_country="IN",
    destination_country="AE",
    source_asset="USDC",
    destination_currency="AED",
    customer_type="business",
)

routes.data[0]`,
                  },
                ]}
                caption="One key works across REST, TypeScript and Python — every claim still carries its own evidence and confidence."
              />
            </Reveal>
          </div>
        </section>

        <section className="border-y border-[var(--color-line)] bg-[var(--color-paper)]">
          <Reveal duration={0.65} className="mx-auto flex w-[min(1360px,calc(100%-2rem))] flex-col gap-8 py-16 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
            <div className="border-l-2 border-[var(--color-orange)] pl-6"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">The intelligence layer for money in motion</p><h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,6vw,6.5rem)] font-medium leading-[0.88] tracking-[-0.075em] text-[var(--color-ink)]">Stop guessing. Start routing.</h2></div>
            <Link href="/login?intent=start" className="group inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3.5 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">Explore Railor <ArrowUpRight size={18} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
