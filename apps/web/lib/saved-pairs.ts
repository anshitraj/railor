import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { CustomerContext } from "@railor/core";
import { getDb, organizations, savedSearches } from "@railor/database";
import { savedProviderSlug, transferBookmarkKey, type TransferBookmark } from "./saved-transfer";
import type { RateAlertSummary } from "./rate-alerts";
import { getEntitlement } from "./entitlements";
import { PLAN_LIMITS } from "./plans";

/**
 * Currency pairs saved from the price calculator ("USD → INR, 1,000"). Stored
 * in saved_searches with kind "price_pair", so nothing else that reads saved
 * routes or monitors sees them. Rate alerts hang off a saved pair (rate-alerts.ts).
 */
/** The free plan's limit; paid plans raise it (plans.ts). Listing never shows more than the largest plan's. */
export const SAVED_PAIR_LIMIT = PLAN_LIMITS.free.savedPairs;
const LIST_LIMIT = Math.max(...Object.values(PLAN_LIMITS).map((limits) => limits.savedPairs));

export interface SavedPair extends TransferBookmark {
  id: string;
  createdAt: string;
  /** The signed-in person's active rate alert on this pair, when listed with alerts. */
  alert?: RateAlertSummary;
}

const CODE = /^[A-Z]{3,5}$/;
const PRICE_BOOKMARK = sql`${savedSearches.query}->>'kind' = 'price_pair'`;

export function pairLabel(pair: Pick<SavedPair, "from" | "to">) {
  return `${pair.from} → ${pair.to}`;
}

export function parsePairInput(input: { from?: unknown; to?: unknown; amount?: unknown; profile?: unknown; context?: unknown; provider?: unknown; destinationCountry?: unknown }): TransferBookmark | null {
  if (!input || typeof input !== "object") return null;
  const from = String(input.from ?? "").toUpperCase();
  const to = String(input.to ?? "").toUpperCase();
  const amount = Number(input.amount);
  if (!CODE.test(from) || !CODE.test(to) || from === to) return null;
  const profile = typeof input.profile === "string" && /^[a-z_]{1,24}$/.test(input.profile) ? input.profile : undefined;
  const pair = { from, to, amount: Number.isFinite(amount) && amount > 0 && amount <= 1e9 ? Math.round(amount * 100) / 100 : 1000, ...(profile ? { profile } : {}) };
  if (input.provider === undefined) return pair;
  if (!input.provider || typeof input.provider !== "object") return null;
  const value = input.provider as { slug?: unknown; name?: unknown };
  const slug = savedProviderSlug(value.slug);
  const context = CustomerContext.safeParse(input.context);
  if (!slug || !context.success || !Number.isFinite(amount) || amount < 1 || amount > 10_000_000) return null;
  const name = typeof value.name === "string" ? value.name.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  const destinationCountry = typeof input.destinationCountry === "string" && /^[A-Z]{2}$/.test(input.destinationCountry) ? input.destinationCountry : undefined;
  return { ...pair, context: context.data, provider: { slug, name: name || slug }, ...(destinationCountry ? { destinationCountry } : {}) };
}

function savedPair(row: typeof savedSearches.$inferSelect): SavedPair | null {
  const pair = parsePairInput(row.query);
  return pair ? { ...pair, id: row.id, createdAt: row.createdAt.toISOString() } : null;
}

export async function listSavedPairs(organizationId: string): Promise<SavedPair[]> {
  const db = await getDb();
  const rows = await db.select().from(savedSearches)
    .where(and(eq(savedSearches.organizationId, organizationId), PRICE_BOOKMARK))
    .orderBy(desc(savedSearches.createdAt)).limit(LIST_LIMIT);
  return rows.map(savedPair).filter(pair => pair !== null);
}

/** Upsert the same pair or provider corridor without disturbing other providers on it. */
export async function savePair(organizationId: string, userId: string, input: Parameters<typeof parsePairInput>[0]): Promise<SavedPair | { error: string }> {
  const pair = parsePairInput(input);
  if (!pair) return { error: "Choose a valid transfer setup first." };
  const db = await getDb();
  return db.transaction(async tx => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
    const rows = await tx.select().from(savedSearches).where(and(eq(savedSearches.organizationId, organizationId), PRICE_BOOKMARK));
    const key = transferBookmarkKey(pair);
    const existing = rows.map(savedPair).find(item => item && transferBookmarkKey(item) === key);
    const limit = (await getEntitlement(organizationId, tx)).limits.savedPairs;
    if (!existing && rows.length >= limit) return { error: `Your plan saves up to ${limit} transfers. Remove one first, or upgrade for more.` };
    const title = pair.provider ? `${pairLabel(pair)} · ${pair.provider.name}` : pairLabel(pair);
    const data = { input: title, query: { kind: "price_pair", ...pair } };
    const [row] = existing
      ? await tx.update(savedSearches).set(data).where(and(eq(savedSearches.id, existing.id), eq(savedSearches.organizationId, organizationId), PRICE_BOOKMARK)).returning()
      : await tx.insert(savedSearches).values({ organizationId, createdBy: userId, ...data }).returning();
    return row ? { ...pair, id: row.id, createdAt: row.createdAt.toISOString() } : { error: "This saved transfer changed. Try again." };
  });
}

export async function removePair(organizationId: string, id: string) {
  const db = await getDb();
  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.organizationId, organizationId), PRICE_BOOKMARK));
}
