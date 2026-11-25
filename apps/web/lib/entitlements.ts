import "server-only";
import { cache } from "react";
import { and, eq, sql } from "drizzle-orm";
import { monthStart } from "@railor/core";
import { getDb, organizationEntitlements, organizations, rateLimitBuckets, type RailorDb } from "@railor/database";
import { effectivePlan, PLAN_LIMITS } from "./plans";

export async function getEntitlement(organizationId: string, db?: RailorDb) {
  const connection = db ?? await getDb();
  const [row] = await connection.select().from(organizationEntitlements).where(eq(organizationEntitlements.organizationId, organizationId)).limit(1);
  const plan = effectivePlan(row);
  return { plan, limits: PLAN_LIMITS[plan], validUntil: row?.validUntil ?? null, status: row?.status === "revoked" ? "revoked" : row && row.plan !== "free" && plan === "free" ? "expired" : "active" };
}

/** Uses the same monthly counter that enforces the workspace API allowance. */
export const getWorkspaceApiUsage = cache(async (organizationId: string) => {
  const db = await getDb();
  const since = monthStart();
  const [entitlement, [usage]] = await Promise.all([
    getEntitlement(organizationId, db),
    db.select({ count: rateLimitBuckets.count }).from(rateLimitBuckets)
      .where(and(eq(rateLimitBuckets.key, `api-month:${organizationId}`), eq(rateLimitBuckets.windowStart, since)))
      .limit(1),
  ]);
  return { entitlement, used: usage?.count ?? 0, since };
});

/** Serializes quota checks and resource creation against the organization's stable row. */
export async function withOrgLock<T>(organizationId: string, action: (db: RailorDb, entitlement: Awaited<ReturnType<typeof getEntitlement>>) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
    if (!org) throw new Error("Organization not found");
    return action(tx, await getEntitlement(organizationId, tx));
  });
}

export async function consumeApiAllowance(organizationId: string, keyId: string, keyCap: number | null): Promise<boolean> {
  // Persistent counters survive usage-rollup pruning. Organization and optional per-key caps are atomic.
  return withOrgLock(organizationId, async (tx, entitlement) => {
    const now = new Date();
    const month = monthStart(now);
    const expires = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const orgKey = `api-month:${organizationId}`;
    const perKey = `api-month-key:${keyId}`;
    const rows = await tx.select().from(rateLimitBuckets).where(sql`${rateLimitBuckets.windowStart} = ${month} and ${rateLimitBuckets.key} in (${orgKey}, ${perKey})`);
    if ((rows.find((r) => r.key === orgKey)?.count ?? 0) >= entitlement.limits.apiRequests ||
        (keyCap !== null && (rows.find((r) => r.key === perKey)?.count ?? 0) >= keyCap)) return false;
    for (const key of [orgKey, perKey]) {
      await tx.insert(rateLimitBuckets).values({ key, windowStart: month, expiresAt: expires, count: 1 })
        .onConflictDoUpdate({ target: [rateLimitBuckets.key, rateLimitBuckets.windowStart], set: { count: sql`${rateLimitBuckets.count} + 1` } });
    }
    return true;
  });
}
