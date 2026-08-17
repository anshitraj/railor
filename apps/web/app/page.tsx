import Link from "next/link";
import { loadChangeFeed, loadPlatformCounts } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { MarketingNav } from "../components/marketing/nav";
import { MarketingFooter } from "../components/marketing/footer";
import { HeroSearch } from "../components/marketing/hero-search";
import { RailArtwork } from "../components/marketing/rail-artwork";
import {
  CapabilityGraphSection,
  ChangeSection,
  CtaSection,
  DeveloperSection,
  EvidenceSection,
  ProblemSection,
  VisionSection,
} from "../components/marketing/sections";
import { FIELD_LABELS, getReferenceOptions, optionsByField } from "../lib/reference";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureMigrated();
  const [reference, counts, changes] = await Promise.all([
    getReferenceOptions(),
    loadPlatformCounts(),
    loadChangeFeed({ limit: 4 }),
  ]);

  return (
    <>
      <MarketingNav />

      <main id="main">
        <section className="relative overflow-hidden pb-16 pt-16">
          <div
            className="rail-grid pointer-events-none absolute inset-x-0 top-0 h-[620px] opacity-70"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-1/2 top-[-180px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,108,255,0.18),transparent)]"
            aria-hidden
          />

          <div className="relative mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="flex flex-col gap-7">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12.5px] text-[var(--color-ink-soft)]">
                <span className="size-1.5 rounded-full bg-[var(--color-lime)]" aria-hidden />
                {counts.providers} providers · {counts.capabilities.toLocaleString()} capabilities ·{" "}
                {counts.sources} sources monitored
              </span>

              <h1 className="text-[clamp(36px,5.4vw,62px)] font-semibold leading-[1.02] tracking-[-0.03em]">
                Know which
                <br />
                financial rail
                <br />
                <span className="text-[var(--color-purple)]">actually works.</span>
              </h1>

              <p className="max-w-xl text-[16px] leading-relaxed text-[var(--color-muted)]">
                Discover, compare and monitor stablecoin, banking, card and compliance
                infrastructure across markets - backed by verifiable sources.
              </p>

              <HeroSearch
                optionsByField={optionsByField(reference)}
                fieldLabels={FIELD_LABELS}
              />
            </div>

            <div className="flex flex-col items-center gap-6">
              <RailArtwork />
              <div className="grid w-full gap-2 sm:grid-cols-3">
                {[
                  ["Entity eligibility", "who can onboard"],
                  ["Corridor coverage", "where value lands"],
                  ["Change detection", "when it moves"],
                ].map(([title, hint]) => (
                  <div
                    key={title}
                    className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white/70 p-3"
                  >
                    <p className="text-[13px] font-medium">{title}</p>
                    <p className="text-[12px] text-[var(--color-muted)]">{hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <ProblemSection />
        <CapabilityGraphSection />
        <EvidenceSection
          sampleVerifiedAt={changes[0]?.change.detectedAt?.toISOString() ?? null}
        />

        <section className="mx-auto w-[min(1180px,calc(100%-2rem))] py-8">
          <div className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-white p-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div className="flex flex-col gap-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Corridor intelligence
              </p>
              <h2 className="text-[clamp(24px,3vw,34px)] font-semibold leading-tight">
                India → USDC → UAE → AED, resolved.
              </h2>
              <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
                Pick the corridor and Railor evaluates every mapped provider across entity
                eligibility, asset, network, destination rail and published limits.
              </p>
              <Link
                href="/app/corridors"
                className="text-[13.5px] font-medium text-[var(--color-purple)]"
              >
                Open Corridor Explorer →
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-canvas)] p-6">
              {["India", "USDC", "Base", "UAE", "AED bank"].map((node, i, arr) => (
                <div key={node} className="flex items-center gap-3">
                  <span className="rounded-full border border-[var(--color-line)] bg-white px-3.5 py-2 text-[13px] font-medium">
                    {node}
                  </span>
                  {i < arr.length - 1 ? (
                    <span className="text-[var(--color-violet)]" aria-hidden>
                      →
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <ChangeSection
          changes={changes.map((c) => ({
            provider: c.providerName,
            summary: c.change.summary,
            detectedAt: c.change.detectedAt.toISOString(),
            kind: c.change.kind,
          }))}
        />
        <DeveloperSection />
        <VisionSection />
        <CtaSection />
      </main>

      <MarketingFooter
        counts={{
          providers: counts.providers,
          countries: counts.countries,
          sources: counts.sources,
          capabilities: counts.capabilities,
        }}
      />
    </>
  );
}

