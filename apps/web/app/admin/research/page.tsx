import { inArray } from "drizzle-orm";
import { RESEARCHABLE_COUNTRIES, loadLatestCountryResearchRuns } from "@railor/core";
import { countries as countriesTable, countryProfiles, getDb } from "@railor/database";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { CountryResearchPanel } from "../../../components/admin/country-research-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Country research" };

export default async function ResearchPage() {
  const db = await getDb();
  const [researched, latestRuns, names] = await Promise.all([
    db.select({ iso2: countryProfiles.iso2, lastResearchedAt: countryProfiles.lastResearchedAt }).from(countryProfiles).where(inArray(countryProfiles.iso2, [...RESEARCHABLE_COUNTRIES])),
    loadLatestCountryResearchRuns([...RESEARCHABLE_COUNTRIES]),
    db.select({ code: countriesTable.code, name: countriesTable.name }).from(countriesTable).where(inArray(countriesTable.code, [...RESEARCHABLE_COUNTRIES])),
  ]);
  const rows = RESEARCHABLE_COUNTRIES.map((iso2) => {
    const profile = researched.find((p) => p.iso2 === iso2);
    const run = latestRuns.get(iso2);
    return {
      iso2,
      name: names.find((c) => c.code === iso2)?.name ?? iso2,
      lastResearchedAt: profile?.lastResearchedAt?.toISOString() ?? null,
      sourcesUsed: run?.sourcesUsed ?? null,
      status: run?.status ?? null,
    };
  }).sort((a, b) => {
    // Not-yet-researched first, then most recent — the actionable ones on top.
    if (!a.lastResearchedAt && !b.lastResearchedAt) return a.name.localeCompare(b.name);
    if (!a.lastResearchedAt) return -1;
    if (!b.lastResearchedAt) return 1;
    return b.lastResearchedAt.localeCompare(a.lastResearchedAt);
  });
  return (
    <>
      <AdminHeader
        title="Country research"
        description="Regulators, local rails, routing codes and compliance regimes per country — researched from authoritative sources, never on a user's request path. Refreshing spends paid research credits."
      />
      <CountryResearchPanel rows={rows} />
    </>
  );
}
