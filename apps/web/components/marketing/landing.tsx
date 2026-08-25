"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Radar,
  Route,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { AnimatedRouteMap } from "./animated-route-map";
import { CurrencyLogo, type CurrencySymbol } from "./currency-logo";
import { CountryFlag, type CountryCode } from "./country-flag";
import { HeroSearch } from "./hero-search";
import { RailsStrip } from "./rails-strip";
import {
  CommandBlock,
  CountUp,
  Reveal,
  Stagger,
  StaggerItem,
  type PickerOption,
} from "@railor/ui";

type LandingProps = {
  counts: { providers: number; countries: number; sources: number; capabilities: number };
  optionsByField: Record<string, PickerOption[]>;
  fieldLabels: Record<string, string>;
};

const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-72px" },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
};

const signals: Array<{ sourceCode: CountryCode; source: string; asset: CurrencySymbol; destinationCode: CountryCode; destination: string; fiat: string }> = [
  { sourceCode: "IN", source: "India", asset: "USDC", destinationCode: "AE", destination: "UAE", fiat: "AED" },
  { sourceCode: "SG", source: "Singapore", asset: "EURC", destinationCode: "EU", destination: "Europe", fiat: "EUR" },
  { sourceCode: "GB", source: "United Kingdom", asset: "USDT", destinationCode: "NG", destination: "Nigeria", fiat: "NGN" },
];

const layers = [
  ["01", "Discover", "Search markets, rails and providers in the language your team actually uses.", ScanSearch],
  ["02", "Verify", "Every important claim resolves to a source, a confidence level and a date.", ShieldCheck],
  ["03", "Monitor", "See the moment a limit, route or requirement changes beneath your integration.", Radar],
] as const;

const changeFeed = [
  ["Ironwood", "AED business payouts", "Coverage expanded", "12m ago"],
  ["Mercury Lane", "KYB document policy", "Requirement changed", "1h ago"],
  ["HarbourPay", "USDC on Base", "Network added", "3h ago"],
];

export function MarketingLanding({ counts, optionsByField, fieldLabels }: LandingProps) {
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
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start"
            >
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

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0"
              >
                <AnimatedRouteMap />
              </motion.div>
            </motion.div>

            <Stagger className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4" step={0.07}>
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

            <Reveal className="mt-2">
              <RailsStrip />
            </Reveal>

            <Reveal delay={0.05} className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
              <CommandBlock
                label="Or query it from your terminal"
                command="npx railor corridors search --entity IN --to AE --asset USDC --currency AED"
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
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[0.87fr_1.13fr] lg:items-end">
              <div>
                <p className="section-kicker">A better picture of the world</p>
                <h2 className="mt-4 max-w-xl font-display text-[clamp(2.75rem,5vw,5.3rem)] font-medium leading-[0.91] tracking-[-0.065em]">Don&apos;t ask who&apos;s biggest. Ask what works.</h2>
              </div>
              <p className="max-w-xl text-[17px] leading-[1.58] text-[var(--color-muted)]">A provider directory can tell you who exists. Railor tells you who can serve this route, for this entity, under these requirements—right now.</p>
            </motion.div>

            <motion.div {...reveal} className="mt-12 overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[var(--color-ink)] text-[var(--color-paper)]">
              <div className="grid border-b border-white/10 px-5 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 sm:grid-cols-[1.4fr_1fr_1fr_1fr_1.1fr] sm:px-7">
                <span>Route request</span><span className="hidden sm:block">Entity</span><span className="hidden sm:block">Destination</span><span className="hidden sm:block">Evidence</span><span className="hidden text-right sm:block">Status</span>
              </div>
              {signals.map((signal, index) => (
                <div key={`${signal.source}-${signal.asset}`} className="grid items-center gap-3 border-b border-white/10 px-5 py-5 last:border-b-0 sm:grid-cols-[1.4fr_1fr_1fr_1fr_1.1fr] sm:px-7">
                  <div className="flex items-center gap-2 text-[14px] font-semibold"><Route size={16} className="text-[var(--color-orange)]" /> <CountryFlag code={signal.sourceCode} size={17} /> {signal.source} <span className="text-white/35">→</span> <CurrencyLogo symbol={signal.asset} size={18} /> {signal.asset}</div>
                  <span className="hidden text-[13px] text-white/65 sm:block">Business</span>
                  <span className="hidden items-center gap-2 text-[13px] text-white/65 sm:flex"><CountryFlag code={signal.destinationCode} size={16} /> {signal.destination} · {signal.fiat}</span>
                  <span className="hidden text-[13px] text-white/65 sm:block">{index === 1 ? "0.92 high" : "0.96 verified"}</span>
                  <span className="w-fit rounded-full bg-[var(--color-orange)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink)] sm:ml-auto">{index === 1 ? "Partial" : "Compatible"}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="bg-[var(--color-paper)] py-20 sm:py-28">
          <div className="mx-auto w-[min(1360px,calc(100%-2rem))]">
            <motion.div {...reveal} className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div><p className="section-kicker">From search to signal</p><h2 className="mt-4 max-w-2xl font-display text-[clamp(2.75rem,5vw,5.3rem)] font-medium leading-[0.91] tracking-[-0.065em]">One working map. No blind spots.</h2></div>
              <Link href="/company/trust" className="group inline-flex items-center gap-1 text-[13px] font-bold uppercase tracking-[0.11em] text-[var(--color-ink)]">How Railor treats evidence <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
            </motion.div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {layers.map(([number, title, copy, Icon], index) => (
                <motion.article key={title} {...reveal} transition={{ ...reveal.transition, delay: index * 0.08 }} className="group relative min-h-[310px] overflow-hidden rounded-[26px] border border-[var(--color-line)] bg-[var(--color-paper)] p-6 transition-colors hover:bg-[var(--color-sand)] sm:p-8">
                  <span className="font-display text-[64px] leading-none tracking-[-0.06em] text-[var(--color-orange)]">{number}</span>
                  <Icon size={26} strokeWidth={1.5} className="absolute right-7 top-8 text-[var(--color-orange)]" />
                  <div className="absolute bottom-7 left-7 right-7 sm:bottom-8 sm:left-8 sm:right-8"><h3 className="font-display text-[31px] font-medium tracking-[-0.05em]">{title}</h3><p className="mt-3 max-w-xs text-[14px] leading-[1.55] text-[var(--color-muted)]">{copy}</p></div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-line)] bg-[var(--color-sand)] py-20 text-[var(--color-ink)] sm:py-28">
          <motion.div {...reveal} className="mx-auto grid w-[min(1360px,calc(100%-2rem))] gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="section-kicker">Always watching</p>
              <h2 className="mt-4 max-w-xl font-display text-[clamp(2.75rem,5.4vw,5.6rem)] font-medium leading-[0.9] tracking-[-0.07em]">Because the world doesn&apos;t hold still.</h2>
              <p className="mt-6 max-w-md text-[16px] leading-[1.6] text-[var(--color-muted)]">Your route may still exist tomorrow. Its requirements, limits or network support might not. Monitor the facts that move your business.</p>
              <Link href="/login?intent=start" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-3 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">Monitor a route <Radar size={17} /></Link>
            </div>
            <div className="overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[var(--color-paper)]">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4 sm:px-6"><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">Intelligence feed</span><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-orange-deep)]"><span className="size-1.5 rounded-full bg-[var(--color-orange)]" /> Listening</span></div>
              {changeFeed.map(([company, event, status, time], index) => (
                <motion.div key={company} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.18 + index * 0.12 }} className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-[var(--color-line)] px-5 py-5 last:border-0 sm:px-6">
                  <span className="mt-1.5 size-2 rounded-full bg-[var(--color-orange)]" />
                  <div><p className="text-[14px] font-semibold">{company}<span className="mx-2 text-[var(--color-faint)]">/</span>{event}</p><p className="mt-1 text-[12px] text-[var(--color-muted)]">{status} · source checked against published documentation</p></div>
                  <span className="text-[11px] text-[var(--color-faint)]">{time}</span>
                </motion.div>
              ))}
              <Link href="/changes" className="flex items-center justify-between px-5 py-4 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-orange-deep)] transition hover:bg-[var(--color-lavender)] sm:px-6">Open full change feed <ArrowUpRight size={15} /></Link>
            </div>
          </motion.div>
        </section>

        <section className="border-y border-[var(--color-line)] bg-[var(--color-paper)]">
          <motion.div {...reveal} className="mx-auto flex w-[min(1360px,calc(100%-2rem))] flex-col gap-8 py-16 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
            <div className="border-l-2 border-[var(--color-orange)] pl-6"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">The intelligence layer for money in motion</p><h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,6vw,6.5rem)] font-medium leading-[0.88] tracking-[-0.075em] text-[var(--color-ink)]">Stop guessing. Start routing.</h2></div>
            <Link href="/login?intent=start" className="group inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3.5 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">Explore Railor <ArrowUpRight size={18} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
