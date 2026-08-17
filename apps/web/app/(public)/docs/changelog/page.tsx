import { Card, SectionLabel } from "@railor/ui";

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
      <div className="flex flex-col gap-3">
        <SectionLabel>Product</SectionLabel>
        <h1 className="text-[32px] font-semibold tracking-tight">Changelog</h1>
      </div>

      {ENTRIES.map((entry) => (
        <Card key={entry.version} className="flex flex-col gap-3 p-5">
          <div className="flex items-baseline gap-3">
            <span className="text-[18px] font-semibold">{entry.version}</span>
            <span className="text-[13px] text-[var(--color-muted)]">{entry.date}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {entry.items.map((item) => (
              <li key={item} className="text-[14px] text-[var(--color-ink-soft)]">
                • {item}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
