import { Card } from "@railor/ui";
import { Bullet, Bullets } from "../../../../components/docs/bullets";
import { DocsHeader } from "../../../../components/docs/docs-header";
import { InlineCode } from "../../../../components/docs/inline-code";

export const metadata = { title: "Changelog" };

const ENTRIES: Array<{ version: string; date: string; items: string[] }> = [
  {
    version: "0.3.0",
    date: "17 Aug 2026",
    items: [
      "CLI: `pnpm cli <command>` — corridors search, providers list, changes list, watch (list/add/remove/alerts), eligibility. Every command is a thin client over `/v1`; `--json` on any read prints the raw response.",
      "GET /v1/changes?since=7d|24h|30m|<ISO date> — filter the change feed by recency, not just by count.",
    ],
  },
  {
    version: "0.2.0",
    date: "17 Aug 2026",
    items: [
      "POST /v1/eligibility — per-provider readiness diffed against your organization's KYB profile, with what-if overrides.",
      "Watchlists over REST: list, create, inspect, retune and disarm monitors on providers, corridors, countries, assets and products.",
      "Alert fan-out: approving a change now alerts every matching watch, and a newly armed watch immediately reports the published changes that already affect it.",
    ],
  },
  {
    version: "0.1.0",
    date: "17 Aug 2026",
    items: [
      "Capability graph, eligibility engine and evidence model.",
      "Public search with value before authentication.",
      "Three-question onboarding that materializes corridors, a monitor and a filtered change feed.",
      "Corridor Explorer with ranking presets and in-place explanations.",
      "Provider directory, profiles, comparison and shareable read-only comparisons.",
      "Monitoring, change feed and KYB readiness profile.",
      "REST /v1 endpoints, developer portal with test keys, and a read-only MCP server.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <DocsHeader eyebrow="Product" title="Changelog" />

      {ENTRIES.map((entry, index) => (
        <Card key={entry.version} className="flex flex-col gap-5 p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <h2 id={`v${entry.version.replaceAll(".", "-")}`} className="text-[24px] font-semibold">
              {entry.version}
            </h2>
            {index === 0 ? (
              <span className="rounded-full bg-[var(--color-lavender)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-orange-deep)]">
                Latest
              </span>
            ) : null}
            <span aria-hidden className="h-px flex-1 bg-[var(--color-line)]" />
            <span className="font-mono text-[12px] text-[var(--color-muted)]">{entry.date}</span>
          </div>
          <Bullets className="text-[var(--color-ink-soft)]">
            {entry.items.map((item) => (
              <Bullet key={item}>
                <InlineCode>{item}</InlineCode>
              </Bullet>
            ))}
          </Bullets>
        </Card>
      ))}
    </>
  );
}
