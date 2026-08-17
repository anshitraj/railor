import Link from "next/link";
import { loadChangeFeed } from "@railor/core";
import { CHANGE_KIND_LABEL } from "@railor/types";
import { Card, Freshness, SectionLabel } from "@railor/ui";

export const metadata = { title: "Change feed" };
export const dynamic = "force-dynamic";

export default async function PublicChangesPage() {
  const feed = await loadChangeFeed({ limit: 40 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionLabel>Change feed</SectionLabel>
        <h1 className="text-[32px] font-semibold tracking-tight">
          Financial infrastructure changes. Railor keeps track.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--color-muted)]">
          Sources are snapshotted, normalized values are diffed, and material changes are held for
          human review before they alter published capability data.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {feed.map(({ change, providerName, providerSlug }) => (
          <Card key={change.id} className="flex flex-col gap-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                {CHANGE_KIND_LABEL[change.kind]}
              </span>
              <Link
                href={`/providers/${providerSlug}`}
                className="text-[13.5px] font-medium hover:text-[var(--color-purple)]"
              >
                {providerName}
              </Link>
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

      <Card className="flex flex-wrap items-center gap-3 bg-[var(--color-lavender)] p-5">
        <p className="flex-1 text-[14px] text-[var(--color-ink-soft)]">
          Watch a provider, corridor or country and Railor tells you before your integration breaks.
        </p>
        <Link
          href="/login?intent=start"
          className="rounded-full bg-[var(--color-purple)] px-4 py-2 text-[13.5px] font-medium text-white"
        >
          Monitor my rails
        </Link>
      </Card>
    </div>
  );
}
