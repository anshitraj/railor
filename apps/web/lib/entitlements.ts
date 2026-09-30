import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, organizationEntitlements, organizations, type RailorDb } from "@railor/database";
import { effectivePlan, PLAN_LIMITS } from "./plans";

export async function getEntitlement(organizationId: string, db?: RailorDb) {
  const connection = db ?? await getDb();
  const [row] = await connection.select().from(organizationEntitlements).where(eq(organizationEntitlements.organizationId, organizationId)).limit(1);
  const plan = effectivePlan(row);
  return { plan, limits: PLAN_LIMITS[plan], validUntil: row?.validUntil ?? null, status: row?.status === "revoked" ? "revoked" : row?.plan === "founding" && plan === "free" ? "expired" : "active" };
}

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
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const expires = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const { rateLimitBuckets } = await import("@railor/database");
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
