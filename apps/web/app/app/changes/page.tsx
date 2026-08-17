import Link from "next/link";
import { loadChangeFeed } from "@railor/core";
import { CHANGE_KIND_LABEL } from "@railor/types";
import { Card, Freshness, SectionLabel } from "@railor/ui";

export const dynamic = "force-dynamic";

export default async function ChangesPage() {
  const feed = await loadChangeFeed({ limit: 50 });
  const pending = feed.filter((f) => f.change.reviewStatus === "pending");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Detected changes</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Everything Railor has detected across mapped providers. Material changes are held for
          human review before they alter published capability data.
        </p>
      </div>

      {pending.length ? (
        <Card className="flex flex-col gap-2 border-dashed p-4">
          <SectionLabel>Pending review</SectionLabel>
          <p className="text-[13px] text-[var(--color-ink-soft)]">
            {pending.length} detected change{pending.length === 1 ? "" : "s"} could not be resolved
            confidently. Railor shows them but has not applied them to capability data.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        {feed.map(({ change, providerName, providerSlug }) => (
          <Card key={change.id} className="flex flex-col gap-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                {CHANGE_KIND_LABEL[change.kind]}
              </span>
              <Link
                href={`/app/providers/${providerSlug}`}
                className="text-[13.5px] font-medium hover:text-[var(--color-purple)]"
              >
                {providerName}
              </Link>
              <span className="tabular text-[11.5px] text-[var(--color-faint)]">{change.field}</span>
              <span className="flex-1" />
              {change.reviewStatus === "pending" ? (
                <span className="rounded-full bg-[var(--color-warn-bg)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-warn)]">
                  Pending review
                </span>
              ) : null}
              <Freshness date={change.detectedAt} prefix="Detected" />
            </div>
            <p className="text-[14px] leading-snug">{change.summary}</p>
            {change.previousValue || change.currentValue ? (
              <p className="tabular text-[12px] text-[var(--color-muted)]">
                {change.previousValue ?? "—"} → {change.currentValue ?? "—"} · confidence{" "}
                {Number(change.confidence).toFixed(2)}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
