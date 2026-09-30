import { desc, eq } from "drizzle-orm";
import { changeEvents, evidence as evidenceTable, getDb, providers, sourceDocuments } from "@railor/database";
import { Card, Freshness, SectionLabel } from "@railor/ui";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { ReviewQueue } from "../../../components/admin/review-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Review queue" };

export default async function ReviewPage() {
  const db = await getDb();
  const [pending, crawlers] = await Promise.all([
    db
      .select({ change: changeEvents, providerName: providers.name, evidenceUrl: evidenceTable.sourceUrl, evidenceTitle: evidenceTable.sourceTitle })
      .from(changeEvents)
      .innerJoin(providers, eq(changeEvents.providerId, providers.id))
      .leftJoin(evidenceTable, eq(changeEvents.evidenceId, evidenceTable.id))
      .where(eq(changeEvents.reviewStatus, "pending"))
      .orderBy(desc(changeEvents.detectedAt))
      .limit(50),
    db
      .select({ source: sourceDocuments, providerName: providers.name })
      .from(sourceDocuments)
      .innerJoin(providers, eq(sourceDocuments.providerId, providers.id))
      .orderBy(desc(sourceDocuments.failureCount), desc(sourceDocuments.lastCheckedAt))
      .limit(60),
  ]);
  const failing = crawlers.filter((c) => c.source.failureCount > 0).length;
  return (
    <>
      <AdminHeader
        title="Review queue"
        description="Detected changes never publish themselves. Approve what the evidence supports; coverage changes are applied to the capability graph, everything else is recorded for a human to action."
      />
      <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3">
          <SectionLabel>Changes awaiting review · {pending.length}</SectionLabel>
          <ReviewQueue
            items={pending.map((row) => ({
              id: row.change.id,
              provider: row.providerName,
              kind: row.change.kind,
              field: row.change.field,
              previousValue: row.change.previousValue,
              currentValue: row.change.currentValue,
              summary: row.change.summary,
              confidence: Number(row.change.confidence),
              detectedAt: row.change.detectedAt.toISOString(),
              sourceUrl: row.evidenceUrl,
              sourceTitle: row.evidenceTitle,
            }))}
          />
        </div>
        <Card className="flex flex-col gap-3 p-5">
          <SectionLabel>
            Source registry · {crawlers.length} tracked · {failing} failing
          </SectionLabel>
          <ul className="flex flex-col gap-2">
            {crawlers.map(({ source, providerName }) => (
              <li key={source.id} className="flex flex-col gap-0.5 border-b border-[var(--color-line)] pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{providerName}</span>
                  <span className="text-[11px] text-[var(--color-muted)]">{source.sourceType.replace(/_/g, " ")}</span>
                  <span className="flex-1" />
                  {source.failureCount > 0 ? <span className="text-[11px] text-[var(--color-bad)]">{source.failureCount} failures</span> : null}
                </div>
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="truncate text-[12px] text-[var(--color-muted)] hover:text-[var(--color-purple)]">
                  {source.url}
                </a>
                <div className="flex items-center gap-2">
                  <Freshness date={source.lastCheckedAt} prefix="Checked" />
                  <span className="text-[11px] text-[var(--color-faint)]">
                    every {source.crawlFrequencyHours}h{source.requiresJs ? " · requires JS" : ""}
                  </span>
                </div>
                {source.lastError ? <span className="text-[11px] text-[var(--color-bad)]">{source.lastError}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
