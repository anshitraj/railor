import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import {
  changeEvents,
  countries as countriesTable,
  countryProfiles,
  evidence as evidenceTable,
  getDb,
  providers,
  sourceDocuments,
} from "@railor/database";
import { getAuditLog, getPlatformUsageSummary, loadLatestCountryResearchRuns, RESEARCHABLE_COUNTRIES } from "@railor/core";
import { Card, Freshness, SectionLabel } from "@railor/ui";
import { getSession } from "../../lib/auth";
import { ReviewQueue } from "../../components/admin/review-queue";
import { RailorMark } from "../../components/marketing/nav";
import { UsageMaintenance } from "../../components/admin/usage-maintenance";
import { CountryResearchPanel } from "../../components/admin/country-research-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations console" };

function relativeTime(date: Date): string {
  const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) {
    return (
      <main className="mx-auto flex w-[min(700px,calc(100%-2rem))] flex-col gap-3 py-24">
        <h1 className="text-[24px] font-semibold">Operations console</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          This console is restricted to Railor operators. Your account ({session.user.email}) does
          not have the operator flag.
        </p>
        <p className="text-[13px] text-[var(--color-faint)]">
          Grant it in the database: <code>update users set is_admin = true where email = &apos;…&apos;;</code>
        </p>
        <Link href="/app" className="text-[13.5px] font-medium text-[var(--color-purple)]">
          ← Back to the workspace
        </Link>
      </main>
    );
  }

  const db = await getDb();
  const [pending, crawlers, recentEvidence, platformUsage, auditLog, researchedCountries, latestRuns] = await Promise.all([
    db
      .select({
        change: changeEvents,
        providerName: providers.name,
        evidenceUrl: evidenceTable.sourceUrl,
        evidenceTitle: evidenceTable.sourceTitle,
      })
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
      .orderBy(desc(sourceDocuments.lastCheckedAt))
      .limit(20),
    db.select().from(evidenceTable).orderBy(desc(evidenceTable.createdAt)).limit(8),
    getPlatformUsageSummary(30),
    getAuditLog(20),
    db
      .select({ iso2: countryProfiles.iso2, lastResearchedAt: countryProfiles.lastResearchedAt })
      .from(countryProfiles)
      .where(inArray(countryProfiles.iso2, [...RESEARCHABLE_COUNTRIES])),
    loadLatestCountryResearchRuns([...RESEARCHABLE_COUNTRIES]),
  ]);

  const failing = crawlers.filter((c) => c.source.failureCount > 0);

  const countryNames = await db
    .select({ code: countriesTable.code, name: countriesTable.name })
    .from(countriesTable)
    .where(inArray(countriesTable.code, [...RESEARCHABLE_COUNTRIES]));
  const countryResearchRows = RESEARCHABLE_COUNTRIES.map((iso2) => {
    const profile = researchedCountries.find((p) => p.iso2 === iso2);
    const run = latestRuns.get(iso2);
    return {
      iso2,
      name: countryNames.find((c) => c.code === iso2)?.name ?? iso2,
      lastResearchedAt: profile?.lastResearchedAt?.toISOString() ?? null,
      sourcesUsed: run?.sourcesUsed ?? null,
      status: run?.status ?? null,
    };
  })
    // Not-yet-researched first — the operator opening this panel almost
    // always wants to know what still needs attention, not to scroll a
    // ~60-row alphabetical list to find it. Researched countries follow, most
    // recent first, since a stale/failed one is the next-most-actionable thing.
    .sort((a, b) => {
      if (!a.lastResearchedAt && !b.lastResearchedAt) return a.name.localeCompare(b.name);
      if (!a.lastResearchedAt) return -1;
      if (!b.lastResearchedAt) return 1;
      return b.lastResearchedAt.localeCompare(a.lastResearchedAt);
    });

  return (
    <main className="mx-auto flex w-[min(1180px,calc(100%-2rem))] flex-col gap-6 py-10">
      <header className="flex items-center gap-3">
        <Link href="/app" className="flex items-center gap-2">
          <RailorMark />
          <span className="text-[15px] font-semibold">Railor</span>
        </Link>
        <span className="rounded-full bg-[var(--color-ink)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white">
          Operations
        </span>
        <span className="flex-1" />
        <span className="text-[13px] text-[var(--color-muted)]">{session.user.email}</span>
      </header>

      <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] md:grid-cols-4">
        {[
          ["Pending review", pending.length],
          ["Sources tracked", crawlers.length],
          ["Crawler failures", failing.length],
          ["Evidence records (recent)", recentEvidence.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-white p-5">
            <p className="tabular text-[26px] font-semibold">{value as number}</p>
            <p className="text-[13px] text-[var(--color-muted)]">{label as string}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3">
          <SectionLabel>Change review</SectionLabel>
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
          <SectionLabel>Source registry</SectionLabel>
          <ul className="flex flex-col gap-2">
            {crawlers.map(({ source, providerName }) => (
              <li key={source.id} className="flex flex-col gap-0.5 border-b border-[var(--color-line)] pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{providerName}</span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {source.sourceType.replace(/_/g, " ")}
                  </span>
                  <span className="flex-1" />
                  {source.failureCount > 0 ? (
                    <span className="text-[11px] text-[var(--color-bad)]">
                      {source.failureCount} failures
                    </span>
                  ) : null}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-[12px] text-[var(--color-muted)] hover:text-[var(--color-purple)]"
                >
                  {source.url}
                </a>
                <div className="flex items-center gap-2">
                  <Freshness date={source.lastCheckedAt} prefix="Checked" />
                  <span className="text-[11px] text-[var(--color-faint)]">
                    every {source.crawlFrequencyHours}h
                    {source.requiresJs ? " · requires JS" : ""}
                  </span>
                </div>
                {source.lastError ? (
                  <span className="text-[11px] text-[var(--color-bad)]">{source.lastError}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>API usage — last 30 days, all orgs</SectionLabel>
            <UsageMaintenance />
          </div>
          {platformUsage.length ? (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                <tr>
                  <th className="pb-2">Organization</th>
                  <th className="pb-2">Requests</th>
                  <th className="pb-2">Errors</th>
                  <th className="pb-2">Last request</th>
                </tr>
              </thead>
              <tbody>
                {platformUsage.map((row) => (
                  <tr key={row.organizationId} className="border-t border-[var(--color-line)]">
                    <td className="py-2">{row.organizationName}</td>
                    <td className="tabular py-2">{row.count}</td>
                    <td className="tabular py-2">{row.errors}</td>
                    <td className="tabular py-2 text-[var(--color-muted)]">
                      {relativeTime(row.lastRequestAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">
              No API calls recorded across any workspace in the last 30 days.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <SectionLabel>Audit log</SectionLabel>
          <ul className="flex flex-col gap-2">
            {auditLog.map((entry) => (
              <li key={entry.id} className="flex flex-col border-b border-[var(--color-line)] pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{entry.action}</span>
                  <span className="flex-1" />
                  <span className="text-[11px] text-[var(--color-faint)]">
                    {relativeTime(entry.createdAt)}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-muted)]">
                  {entry.actorEmail ?? "unknown actor"}
                  {entry.organizationName ? ` · ${entry.organizationName}` : ""}
                  {entry.target ? ` · ${entry.target}` : ""}
                </span>
              </li>
            ))}
            {!auditLog.length ? (
              <li className="text-[13px] text-[var(--color-muted)]">No admin actions recorded yet.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Country intelligence</SectionLabel>
        <CountryResearchPanel rows={countryResearchRows} />
      </Card>
    </main>
  );
}
