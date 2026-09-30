import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { discoveryReviews, getDb, productEvents } from "@railor/database";
import { CorridorQuery, MarketDiscoveryResult } from "@railor/types";
import { requireProductRole } from "./product-control.js";

export async function saveDiscoveryReviews(organizationId: string, query: unknown, result: MarketDiscoveryResult) {
  const parsed = CorridorQuery.parse(query);
  const db = await getDb();
  for (const candidate of result.candidates.slice(0, 6)) {
    const fingerprint = createHash("sha256").update(JSON.stringify({ query: Object.entries(parsed).sort(), candidate, generatedAt: result.generatedAt })).digest("hex");
    await db.insert(discoveryReviews).values({ organizationId, fingerprint, query: parsed,
      candidate: candidate as unknown as Record<string, unknown>, discoveredAt: new Date(result.generatedAt) }).onConflictDoNothing();
  }
}

export async function listDiscoveryReviews(organizationId: string) {
  return (await getDb()).select().from(discoveryReviews).where(eq(discoveryReviews.organizationId, organizationId)).orderBy(desc(discoveryReviews.createdAt)).limit(100);
}

export async function reviewDiscovery(organizationId: string, actorId: string, raw: unknown) {
  await requireProductRole(organizationId, actorId, true);
  const input = z.object({ id: z.string().uuid(), status: z.enum(["investigate", "dismissed"]), comment: z.string().trim().min(1).max(2000) }).parse(raw);
  return (await getDb()).transaction(async (tx) => {
    const [row] = await tx.update(discoveryReviews).set({ status: input.status, comment: input.comment, reviewedBy: actorId, reviewedAt: new Date() })
      .where(and(eq(discoveryReviews.id, input.id), eq(discoveryReviews.organizationId, organizationId), eq(discoveryReviews.status, "pending"))).returning();
    if (!row) throw new Error("review_not_found_or_resolved");
    await tx.insert(productEvents).values({ organizationId, actorId, kind: `discovery_${input.status}`, targetId: row.id, data: { comment: input.comment } });
    return row;
  });
}
