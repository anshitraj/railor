import "server-only";

import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { getDb, providerPromotions } from "@railor/database";

export async function activeProviderPromotions(from: string, to: string, now = new Date()) {
  const db = await getDb();
  const rows = await db.select({
    slug: providerPromotions.providerSlug, endsAt: providerPromotions.endsAt,
  }).from(providerPromotions).where(and(
    eq(providerPromotions.sourceCurrency, from),
    eq(providerPromotions.destinationCurrency, to),
    lte(providerPromotions.confirmedAt, now),
    gt(providerPromotions.endsAt, now),
    isNull(providerPromotions.revokedAt),
  ));
  return rows.map(row => ({ slug: row.slug, endsAt: row.endsAt.toISOString() }));
}
