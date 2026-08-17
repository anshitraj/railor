import { Card, SectionLabel, StageBadge } from "@railor/ui";

export const metadata = { title: "Roadmap" };

const STAGES: Array<{ title: string; body: string; stage: "live" | "beta" | "soon" }> = [
  {
    title: "1 · Intelligence",
    body: "Can this provider support what I'm building? Normalized capabilities, eligibility with reasons, evidence on every claim.",
    stage: "live",
  },
  {
    title: "2 · Monitoring",
    body: "Tell me when a rail, country, requirement or capability changes. Snapshots, diffs, change events, alerts.",
    stage: "live",
  },
  {
    title: "3 · Benchmarking",
    body: "Which provider actually performs better? Observation and health tables exist today; Railor publishes numbers only once it has measured them.",
    stage: "soon",
  },
  {
    title: "4 · Developer API",
    body: "Structured access to the same answers: REST, SDKs, CLI and an MCP server for agents.",
    stage: "beta",
  },
  {
    title: "5 · Connections",
    body: "Organizations connect the provider accounts they already have, so Railor knows what is actually available to them.",
    stage: "soon",
  },
  {
    title: "6 · Unified interface",
    body: "One set of objects — customers, beneficiaries, quotes, payouts, cards — over many providers.",
    stage: "soon",
  },
  {
    title: "7 · Orchestration",
    body: "Route by eligibility, compliance, cost, FX, reliability, settlement speed and limits. Eligibility is a gate, never a weight.",
    stage: "soon",
  },
];

export default function RoadmapPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>Roadmap</SectionLabel>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">
          Railor maps financial infrastructure today and becomes the programmatic interface
          developers rely on tomorrow.
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          Stages marked “coming soon” are architected but not built. They appear here rather than as
          a working-looking screen, because a fake capability is the one thing this product cannot
          afford.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {STAGES.map((stage) => (
          <Card key={stage.title} className="flex flex-col gap-1.5 p-5">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-medium">{stage.title}</p>
              <StageBadge stage={stage.stage} />
            </div>
            <p className="text-[13.5px] leading-relaxed text-[var(--color-muted)]">{stage.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
