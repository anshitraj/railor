import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { apiKeys, apiUsage, getDb } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { getSavedCorridors } from "../../../lib/org";
import { DeveloperPortal } from "../../../components/app/developer-portal";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const db = await getDb();
  const [keys, usage, corridors] = await Promise.all([
    db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, org.id))
      .orderBy(desc(apiKeys.createdAt)),
    db.select().from(apiUsage).where(eq(apiUsage.organizationId, org.id)).limit(500),
    getSavedCorridors(org.id),
  ]);

  const byEndpoint = new Map<string, { count: number; errors: number; latencies: number[] }>();
  for (const row of usage) {
    const entry = byEndpoint.get(row.endpoint) ?? { count: 0, errors: 0, latencies: [] };
    entry.count += 1;
    if (row.status >= 400) entry.errors += 1;
    if (row.latencyMs) entry.latencies.push(row.latencyMs);
    byEndpoint.set(row.endpoint, entry);
  }

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
      }))}
      usage={[...byEndpoint.entries()].map(([endpoint, entry]) => {
        const sorted = entry.latencies.sort((a, b) => a - b);
        const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] ?? sorted.at(-1)! : 0;
        return { endpoint, count: entry.count, errors: entry.errors, p95 };
      })}
    />
  );
}
