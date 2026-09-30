import Link from "next/link";
import { Card } from "@railor/ui";
import { PageHeader } from "../../../components/marketing/page-header";

export const metadata = { title: "Company" };

export default function CompanyPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader eyebrow="Company" title="Railor exists because the answer is knowable — it just isn't written down anywhere.">
        <p>
          Every stablecoin and payments team runs the same loop: ask a community which provider
          works for a country, read a dozen docs sites, sit through sales calls, keep a spreadsheet,
          then discover the incompatibility during implementation. The information exists. It is
          published, fragmented, described differently by every provider, and silently out of date.
        </p>
        <p>
          Railor normalizes it into one capability graph, attaches a source and a verification time
          to every claim, watches those sources for change, and exposes the result through a web
          app, an API and an MCP server.
        </p>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Normalized", "One schema across countries, entities, assets, networks, products, requirements and limits."],
          ["Evidenced", "Source, retrieval time, verification time and a decaying confidence score on every claim."],
          ["Monitored", "Snapshots and diffs, with material changes held for human review."],
        ].map(([title, body]) => (
          <Card key={title} className="flex flex-col gap-1.5 p-5">
            <p className="font-display text-[16px] font-semibold tracking-[-0.02em]">{title}</p>
            <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">{body}</p>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3 bg-[var(--color-lavender)] p-6">
        <p className="text-[16px] font-medium text-[var(--color-purple-deep)]">
          It is better for Railor to say “unknown” than to confidently provide incorrect financial
          infrastructure information.
        </p>
        <p className="text-[13.5px] text-[var(--color-ink-soft)]">
          That principle outranks every other product decision here, including the ones that would
          make a demo look better.
        </p>
        <Link href="/company/trust" className="text-[13.5px] font-medium text-[var(--color-purple)]">
          How we handle data and claims →
        </Link>
      </Card>
    </div>
  );
}
