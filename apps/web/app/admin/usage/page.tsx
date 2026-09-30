import { count, desc, max } from "drizzle-orm";
import { corridorLabel, getPlatformUsageSummary, loadTopCorridorDemand } from "@railor/core";
import { featureInterest, getDb } from "@railor/database";
import { Card, SectionLabel } from "@railor/ui";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { UsageMaintenance } from "../../../components/admin/usage-maintenance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Usage & demand" };

function relativeTime(date: Date): string {
  const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default async function UsagePage() {
  const db = await getDb();
  const [platformUsage, topDemand, roadmapDemand] = await Promise.all([
    getPlatformUsageSummary(30, 50),
    loadTopCorridorDemand(25),
    db.select({ feature: featureInterest.feature, requests: count(), latest: max(featureInterest.createdAt) }).from(featureInterest).groupBy(featureInterest.feature).orderBy(desc(count())),
  ]);
  return (
    <>
      <AdminHeader title="Usage & demand" description="Who uses the API, which corridors people search for, and which roadmap features they asked to hear about." />
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>API usage — last 30 days, all workspaces</SectionLabel>
          <UsageMaintenance />
        </div>
        {platformUsage.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                <tr>
                  <th className="pb-2">Workspace</th>
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
                    <td className="tabular py-2 text-[var(--color-muted)]">{relativeTime(row.lastRequestAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-muted)]">No API calls recorded across any workspace in the last 30 days.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Corridor demand</SectionLabel>
        <p className="text-[12px] text-[var(--color-muted)]">Real corridor search intent, aggregated across every non-demo search — anonymous, no per-user data.</p>
        {topDemand.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                <tr>
                  <th className="pb-2">Corridor</th>
                  <th className="pb-2">Searches</th>
                  <th className="pb-2">Avg. requested amount</th>
                  <th className="pb-2">Last searched</th>
                </tr>
              </thead>
              <tbody>
                {topDemand.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--color-line)]">
                    <td className="py-2">{corridorLabel(row.query)}</td>
                    <td className="tabular py-2">{row.searchCount}</td>
                    <td className="tabular py-2 text-[var(--color-muted)]">
                      {row.averageRequestedVolume !== null ? `${Math.round(row.averageRequestedVolume).toLocaleString("en-US")} (${row.volumeSearchCount} of ${row.searchCount})` : "No amount specified"}
                    </td>
                    <td className="tabular py-2 text-[var(--color-muted)]">{relativeTime(row.lastSearchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-muted)]">No real searches recorded yet.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Roadmap demand</SectionLabel>
        <p className="text-[12px] text-[var(--color-muted)]">Distinct addresses that asked to be notified when a Coming-soon feature ships.</p>
        {roadmapDemand.length ? (
          <ul className="flex flex-wrap gap-2">
            {roadmapDemand.map((row) => (
              <li key={row.feature} className="flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px]">
                <span className="font-medium">{row.feature}</span>
                <span className="tabular text-[var(--color-orange-deep)]">{row.requests}</span>
                <span className="text-[11px] text-[var(--color-faint)]">{row.latest ? relativeTime(row.latest) : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--color-muted)]">Nobody has asked to be notified yet.</p>
        )}
      </Card>
    </>
  );
}
