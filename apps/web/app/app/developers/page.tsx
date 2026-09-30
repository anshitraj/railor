import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { apiKeys, getDb, rateLimitBuckets } from "@railor/database";
import { getEntitlement } from "../../../lib/entitlements";
import {
  getMonthlyUsageCount,
  getUsageByEndpoint,
  getUsageDailySeries,
  monthStart,
} from "@railor/core";
import { getSession } from "../../../lib/auth";
import { createApiKey, getSavedCorridors } from "../../../lib/org";
import { DeveloperPortal } from "../../../components/app/developer-portal";
import { WebhookEndpoints } from "../../../components/app/webhook-endpoints";
import { listWebhookDeliveries, listWebhookEndpoints } from "@railor/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Developers" };

export default async function DevelopersPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const db = await getDb();
  // Law 9: a test key exists before anyone asks for one. Workspaces created before
  // keys were auto-provisioned (or whose key was revoked) get one on first visit.
  const [anyTestKey] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, org.id), eq(apiKeys.mode, "test"), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!anyTestKey && session.role !== "viewer") await createApiKey(org.id, session.user.id, "Default test key", "test");

  const entitlement = await getEntitlement(org.id);
  const [workspaceUsage] = await db.select().from(rateLimitBuckets).where(and(eq(rateLimitBuckets.key, `api-month:${org.id}`), eq(rateLimitBuckets.windowStart, monthStart())));
  const keyLimit = (key: { monthlyRequestCap: number | null }) => Math.min(key.monthlyRequestCap ?? entitlement.limits.apiRequests, entitlement.limits.apiRequests);
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
        used: workspaceUsage?.count ?? 0,
        cap: entitlement.limits.apiRequests,
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

  const [endpoints, deliveries] = await Promise.all([listWebhookEndpoints(org.id), listWebhookDeliveries(org.id, 30)]);

  return (
    <div className="flex flex-col gap-5">
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
        monthlyCap: k.revokedAt ? null : keyLimit(k),
      }))}
      usage={usage}
      dailySeries={dailySeries}
      quota={quota}
    />
    <WebhookEndpoints
      canManage={session.role === "owner" || session.role === "admin"}
      endpoints={endpoints.map((e) => ({ id: e.id, url: e.url, description: e.description, mode: e.mode, events: e.events, enabled: e.enabled, secretHint: e.secretHint }))}
      deliveries={deliveries.map(({ delivery, url }) => ({ id: delivery.id, eventType: delivery.eventType, status: delivery.status, attempts: delivery.attempts, lastStatusCode: delivery.lastStatusCode, lastError: delivery.lastError, createdAt: delivery.createdAt.toISOString(), url }))}
    />
    </div>
  );
}
