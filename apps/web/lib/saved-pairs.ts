import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, savedSearches } from "@railor/database";

/**
 * Currency pairs saved from the price calculator ("USD → INR, 1,000"). Stored
 * in saved_searches with kind "price_pair", so nothing else that reads saved
 * routes or monitors sees them. Reminders on a pair are coming later.
 */
export const SAVED_PAIR_LIMIT = 12;

export interface SavedPair {
  id: string;
  from: string;
  to: string;
  amount: number;
  profile?: string;
  createdAt: string;
}

const CODE = /^[A-Z]{3,5}$/;

export function pairLabel(pair: Pick<SavedPair, "from" | "to">) {
  return `${pair.from} → ${pair.to}`;
}

export function parsePairInput(input: { from?: unknown; to?: unknown; amount?: unknown; profile?: unknown }) {
  const from = String(input.from ?? "").toUpperCase();
  const to = String(input.to ?? "").toUpperCase();
  const amount = Number(input.amount);
  if (!CODE.test(from) || !CODE.test(to) || from === to) return null;
  const profile = typeof input.profile === "string" && /^[a-z_]{1,24}$/.test(input.profile) ? input.profile : undefined;
  return { from, to, amount: Number.isFinite(amount) && amount > 0 && amount <= 1e9 ? Math.round(amount * 100) / 100 : 1000, ...(profile ? { profile } : {}) };
}

export async function listSavedPairs(organizationId: string): Promise<SavedPair[]> {
  const db = await getDb();
  const rows = await db.select().from(savedSearches)
    .where(and(eq(savedSearches.organizationId, organizationId), sql`${savedSearches.query}->>'kind' = 'price_pair'`))
    .orderBy(desc(savedSearches.createdAt)).limit(SAVED_PAIR_LIMIT);
  return rows.flatMap((row) => {
    const pair = parsePairInput(row.query);
    return pair ? [{ id: row.id, ...pair, createdAt: row.createdAt.toISOString() }] : [];
  });
}

/** Saves a pair once per dashboard: saving USD → INR again just updates its amount. */
export async function savePair(organizationId: string, userId: string, input: Parameters<typeof parsePairInput>[0]): Promise<SavedPair | { error: string }> {
  const pair = parsePairInput(input);
  if (!pair) return { error: "Pick two different currencies first." };
  const db = await getDb();
  const existing = (await listSavedPairs(organizationId)).find((item) => item.from === pair.from && item.to === pair.to);
  if (existing) await db.delete(savedSearches).where(and(eq(savedSearches.id, existing.id), eq(savedSearches.organizationId, organizationId)));
  else if ((await listSavedPairs(organizationId)).length >= SAVED_PAIR_LIMIT) return { error: `You can save up to ${SAVED_PAIR_LIMIT} pairs. Remove one first.` };
  const [row] = await db.insert(savedSearches).values({ organizationId, createdBy: userId, input: pairLabel(pair), query: { kind: "price_pair", ...pair } }).returning();
  return { id: row!.id, ...pair, createdAt: row!.createdAt.toISOString() };
}

export async function removePair(organizationId: string, id: string) {
  const db = await getDb();
  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.organizationId, organizationId)));
}
