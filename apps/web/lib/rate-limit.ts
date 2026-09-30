import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { ensureMigrated, getDb, rateLimitBuckets } from "@railor/database";

/** Atomic across instances; raw IP and email addresses are never persisted. */
export async function consumeLimit(scope: string, identity: string, limit: number, windowMs: number): Promise<boolean> {
  await ensureMigrated();
  const db = await getDb();
  const key = `${scope}:${createHash("sha256").update(identity).digest("hex")}`;
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  const [row] = await db.insert(rateLimitBuckets).values({
    key, windowStart: new Date(start), count: 1, expiresAt: new Date(start + windowMs),
  }).onConflictDoUpdate({
    target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
    set: { count: sql`${rateLimitBuckets.count} + 1` },
    setWhere: sql`${rateLimitBuckets.count} < ${limit}`,
  }).returning({ count: rateLimitBuckets.count });
  return Boolean(row && row.count <= limit);
}

export function requestIdentity(request: Request): string {
  // Vercel overwrites this header. Self-hosted deployments must do so at the proxy.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

export const checkBurstLimit = (key: string) => consumeLimit("api-burst", key, 30, 10_000);
