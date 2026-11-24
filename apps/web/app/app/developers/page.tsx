import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { apiKeys, getDb } from "@railor/database";
import { getWorkspaceApiUsage } from "../../../lib/entitlements";
import {
  getMonthlyUsageCount,
  getUsageByEndpoint,
  getUsageDailySeries,
} from "@railor/core";
import { getSession } from "../../../lib/auth";
import { getSavedCorridors } from "../../../lib/org";
import { DeveloperPortal } from "../../../components/app/developer-portal";
import { WebhookEndpoints } from "../../../components/app/webhook-endpoints";
import { listWebhookDeliveries, listWebhookEndpoints } from "@railor/core";
import type { CorridorQuery } from "@railor/types";
import { developerExampleQuery } from "../../../lib/developer-setup";
import { appOrigin } from "../../../lib/security";

export const dynamic = "force-dynamic";
export const metadata = { title: "Developers" };

export default async function DevelopersPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const db = await getDb();
  const canManage = session.role === "owner" || session.role === "admin";
  const { entitlement, used, since } = await getWorkspaceApiUsage(org.id);
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
        used,
        cap: entitlement.limits.apiRequests,
        mode: primaryKey.mode,
      }
    : null;

  const exampleQuery = developerExampleQuery(org, (corridors[0]?.query ?? {}) as Partial<CorridorQuery>);

  const [endpoints, deliveries] = await Promise.all([listWebhookEndpoints(org.id), listWebhookDeliveries(org.id, 30)]);

  return (
    <div className="flex flex-col gap-5">
    <DeveloperPortal
      baseUrl={appOrigin()}
      exampleQuery={exampleQuery}
      canManage={canManage}
      keys={keys.map((k) => ({
        id: k.id,
        label: k.label,
        mode: k.mode,
        prefix: k.prefix,
        secret: canManage ? k.revealableSecret : null,
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
    <details className="mx-auto w-full max-w-[980px] rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-5"><summary className="cursor-pointer text-[15px] font-semibold">Webhooks & delivery history</summary><div className="mt-5"><WebhookEndpoints
      canManage={session.role === "owner" || session.role === "admin"}
      endpoints={endpoints.map((e) => ({ id: e.id, url: e.url, description: e.description, mode: e.mode, events: e.events, enabled: e.enabled, secretHint: e.secretHint }))}
      deliveries={deliveries.map(({ delivery, url }) => ({ id: delivery.id, eventType: delivery.eventType, status: delivery.status, attempts: delivery.attempts, lastStatusCode: delivery.lastStatusCode, lastError: delivery.lastError, createdAt: delivery.createdAt.toISOString(), url }))}
    /></div></details>
    </div>
  );
}
