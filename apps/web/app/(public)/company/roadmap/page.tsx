import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, type Stage } from "@railor/ui";
import { NotifyMe, type NotifyFeature } from "../../../../components/notify-me";
import { PageHeader } from "../../../../components/marketing/page-header";
import { getSession } from "../../../../lib/auth";

export const metadata = { title: "Roadmap" };
export const dynamic = "force-dynamic";

interface RoadmapStage {
  name: string;
  body: string;
  stage: Stage;
  /** A page where the stage can be used or read about — a roadmap entry should lead to the thing itself. */
  link?: { label: string; href: string };
  notify?: NotifyFeature;
}

const STAGES: RoadmapStage[] = [
  {
    name: "Intelligence",
    body: "Can this provider support what I'm building? Normalized capabilities, eligibility with reasons, evidence on every claim.",
    stage: "live",
    link: { label: "Browse providers", href: "/providers" },
  },
  {
    name: "Monitoring",
    body: "Tell me when a rail, country, requirement or capability changes. Snapshots, diffs, change events, alerts.",
    stage: "live",
    link: { label: "Open the change feed", href: "/changes" },
  },
  {
    name: "Benchmarking",
    body: "Which provider actually performs better? Observation and health tables exist today; Railor publishes numbers only once it has measured them.",
    stage: "soon",
    notify: "benchmarks",
  },
  {
    name: "Developer API",
    body: "Structured access to the same answers: REST, SDKs, CLI and an MCP server for agents.",
    stage: "beta",
    link: { label: "API reference", href: "/docs/api" },
  },
  {
    name: "Connections",
    body: "Organizations connect the provider accounts they already have — sandbox and production, tested live, stored encrypted — so Railor knows what is actually available to them.",
    stage: "beta",
    link: { label: "Manage connections", href: "/app/settings/connections" },
  },
  {
    name: "Unified interface",
    body: "One set of objects over many providers. Live now: beneficiaries, route plans, payments and signed webhooks. Next: customers, cards and accounts.",
    stage: "beta",
    link: { label: "Payments docs", href: "/docs/payments" },
    notify: "unified-api",
  },
  {
    name: "Orchestration",
    body: "Payments route by eligibility and policy (hard gates), then health, observed reliability, cost, speed, limits and your preferences — falling back to the next provider only on a definitive rejection, never on an ambiguous one.",
    stage: "beta",
    link: { label: "Payments & routing", href: "/docs/payments" },
  },
];

/** Live is green, beta is the brand orange, coming soon is drawn dashed: unbuilt work must never look finished. */
const STATUS: Record<Stage, { label: string; meaning: string; chip: string; dot: string; node: string; segment: string; card: string }> = {
  live: {
    label: "Live",
    meaning: "Available today.",
    chip: "border-[#20713d]/20 bg-[#e9f6ed] text-[#20713d]",
    dot: "bg-[var(--color-ok)]",
    node: "bg-[#20713d] text-white",
    segment: "bg-[var(--color-ok)]",
    card: "border-[var(--color-line)] bg-[var(--color-surface)]",
  },
  beta: {
    label: "Beta",
    meaning: "Usable now, still changing.",
    chip: "border-[var(--color-orange-deep)]/20 bg-[var(--color-lavender)] text-[var(--color-orange-deep)]",
    dot: "bg-[var(--color-orange)]",
    node: "bg-[var(--color-lavender-deep)] text-[var(--color-orange-deep)]",
    segment: "bg-[var(--color-orange)]",
    card: "border-[var(--color-line)] bg-[var(--color-surface)]",
  },
  soon: {
    label: "Coming soon",
    meaning: "Architected, not built.",
    chip: "border-dashed border-[var(--color-faint)] text-[var(--color-muted)]",
    dot: "border border-current",
    node: "border border-dashed border-[var(--color-faint)] bg-[var(--color-canvas)] text-[var(--color-muted)]",
    segment: "border border-dashed border-[var(--color-faint)]",
    card: "border-dashed border-[var(--color-line-strong)] bg-transparent",
  },
};

const ORDER: Stage[] = ["live", "beta", "soon"];

function StatusChip({ stage }: { stage: Stage }) {
  const status = STATUS[stage];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold uppercase leading-none tracking-[0.08em]",
        status.chip,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
      {status.label}
    </span>
  );
}

export default async function RoadmapPage() {
  const session = await getSession();
  const counts = ORDER.map((stage) => ({ stage, count: STAGES.filter((s) => s.stage === stage).length }));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Roadmap"
        title="Railor maps financial infrastructure today and becomes the programmatic interface developers rely on tomorrow."
      >
        <p>
          Stages marked “coming soon” are architected but not built. They appear here rather than as
          a working-looking screen, because a fake capability is the one thing this product cannot
          afford.
        </p>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-12">
        <ol className="relative flex flex-col gap-4 pl-12 before:absolute before:bottom-6 before:left-[17px] before:top-6 before:w-px before:bg-gradient-to-b before:from-[var(--color-line-strong)] before:to-transparent">
          {STAGES.map((stage, index) => {
            const status = STATUS[stage.stage];
            const number = index + 1;
            return (
              <li
                key={stage.name}
                id={`stage-${number}`}
                className="railor-rise relative scroll-mt-28"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-12 top-5 grid size-9 place-items-center rounded-full font-display text-[14px] font-semibold ring-4 ring-[var(--color-canvas)]",
                    status.node,
                  )}
                >
                  {number}
                </span>
                <article aria-labelledby={`stage-${number}-title`} className={cn("flex flex-col gap-3 rounded-2xl border p-5 sm:p-6", status.card)}>
                  <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 id={`stage-${number}-title`} className="font-display text-[20px] font-semibold leading-tight tracking-[-0.03em]">
                      {stage.name}
                    </h2>
                    <StatusChip stage={stage.stage} />
                  </header>
                  <p className="max-w-[68ch] text-[14px] leading-relaxed text-[var(--color-muted)]">{stage.body}</p>
                  {stage.link || stage.notify ? (
                    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dashed border-[var(--color-line)] pt-3">
                      {stage.link ? (
                        <Link
                          href={stage.link.href}
                          className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-orange-deep)] transition hover:text-[var(--color-ink)]"
                        >
                          {stage.link.label}
                          <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                        </Link>
                      ) : null}
                      {stage.notify ? <NotifyMe feature={stage.notify} signedIn={Boolean(session)} /> : null}
                    </footer>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>

        <aside
          aria-labelledby="roadmap-status"
          className="flex flex-col gap-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 max-lg:order-first lg:sticky lg:top-24"
        >
          <h2 id="roadmap-status" className="font-display text-[17px] font-semibold tracking-[-0.03em]">
            Where Railor stands
          </h2>

          <nav aria-label="Jump to a stage">
            <ol className="flex gap-1.5">
              {STAGES.map((stage, index) => (
                <li key={stage.name} className="flex-1">
                  <a
                    href={`#stage-${index + 1}`}
                    title={`${index + 1} · ${stage.name} — ${STATUS[stage.stage].label.toLowerCase()}`}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <span className={cn("h-2 w-full rounded-full transition group-hover:opacity-70", STATUS[stage.stage].segment)} />
                    <span className="font-mono text-[10px] text-[var(--color-muted)] transition group-hover:text-[var(--color-ink)]">
                      {index + 1}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <dl className="flex flex-col gap-3 border-t border-dashed border-[var(--color-line)] pt-4">
            {counts.map(({ stage, count }) => (
              <div key={stage} className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <dt className="flex items-center gap-2 text-[13px] font-semibold">
                    <span aria-hidden className={cn("size-2 rounded-full", STATUS[stage].dot)} />
                    {STATUS[stage].label}
                  </dt>
                  <dd className="pl-4 text-[12px] text-[var(--color-muted)]">{STATUS[stage].meaning}</dd>
                </div>
                <span className="font-display text-[22px] font-semibold leading-none tabular">{count}</span>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <section className="product-dark flex flex-wrap items-center gap-5 p-6 sm:p-8">
        <div className="relative z-10 flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
          <p className="font-display text-[22px] font-semibold leading-tight">See the live stages for yourself.</p>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-white/65">
            Describe a corridor in plain words — every mapped provider comes back with a verdict, a reason and a source.
          </p>
        </div>
        <Link
          href="/#search"
          className="relative z-10 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-[#22211f] transition hover:bg-[#ffad8c]"
        >
          Search rails <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}
