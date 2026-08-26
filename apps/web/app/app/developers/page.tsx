import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { apiKeys, getDb } from "@railor/database";
import {
  getMonthlyUsageCount,
  getUsageByEndpoint,
  getUsageDailySeries,
  monthStart,
  resolveMonthlyCap,
} from "@railor/core";
import { getSession } from "../../../lib/auth";
import { getSavedCorridors } from "../../../lib/org";
import { DeveloperPortal } from "../../../components/app/developer-portal";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const db = await getDb();
  const [keys, usage, dailySeries, corridors] = await Promise.all([
    db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, org.id))
      .orderBy(desc(apiKeys.createdAt)),
    getUsageByEndpoint(org.id),
    getUsageDailySeries(org.id, 30),
    getSavedCorridors(org.id),
  ]);

  // Every active key gets its own usage count — a test-only org (the
  // free-tier default before a live key ever exists) still has real numbers
  // to show, not just an org that graduated to a live key.
  const since = monthStart();
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const usageByKey = new Map(
    await Promise.all(
      activeKeys.map(async (k) => [k.id, await getMonthlyUsageCount(k.id, since)] as const),
    ),
  );

  const liveKey = activeKeys.find((k) => k.mode === "live");
  const testKey = activeKeys.find((k) => k.mode === "test");
  const primaryKey = liveKey ?? testKey;
  const quota = primaryKey
    ? {
        used: usageByKey.get(primaryKey.id) ?? 0,
        cap: resolveMonthlyCap(primaryKey),
        mode: primaryKey.mode,
      }
    : null;

  const corridorQuery = (corridors[0]?.query ?? {}) as Record<string, unknown>;
  const exampleQuery = {
    entity_country: corridorQuery.entityCountry ?? org.entityCountry ?? "IN",
    destination_country: corridorQuery.destinationCountry ?? org.targetCountries?.[0] ?? "AE",
    asset: corridorQuery.sourceAsset ?? "USDC",
    destination_currency:
      corridorQuery.destinationCurrency ?? org.settlementCurrencies?.[0] ?? "AED",
    customer_type: "business",
  };

  return (
    <DeveloperPortal
      baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
      exampleQuery={exampleQuery}
      keys={keys.map((k) => ({
        id: k.id,
        label: k.label,
        mode: k.mode,
        prefix: k.prefix,
        secret: k.revealableSecret,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
        revoked: Boolean(k.revokedAt),
        monthlyUsed: k.revokedAt ? null : (usageByKey.get(k.id) ?? 0),
        monthlyCap: k.revokedAt ? null : resolveMonthlyCap(k),
      }))}
      usage={usage}
      dailySeries={dailySeries}
      quota={quota}
    />
  );
}
