/**
 * Promotions and recorded quote history.
 *
 * - Provider offers are operator-entered and only ever shown beside prices;
 *   nothing here changes a price or a ranking. (Paid placements live in
 *   `provider_promotions`.)
 * - Discount codes price Railor's own plans and top-ups. `priceWithDiscount`
 *   is the one rule for what a code takes off; `checkDiscountCode` says whether
 *   a workspace may use it right now.
 * - Quote snapshots keep one row per provider, corridor, amount and UTC day, so
 *   history charts draw only days Railor actually priced.
 *
 * Functions take the database explicitly so they run in tests on PGlite.
 */
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { RailorDb } from "./client.js";
import {
  billingCheckouts,
  discountCodes,
  discountRedemptions,
  providerOffers,
  quoteSnapshots,
  type DiscountCode,
  type ProviderOffer,
} from "./schema.js";

/* -------------------------------------------------------------------------- */
/* Provider offers                                                             */
/* -------------------------------------------------------------------------- */

export interface ActivePromotions {
  offers: Array<Pick<ProviderOffer, "id" | "providerSlug" | "kind" | "headline" | "terms" | "sourceUrl" | "newCustomersOnly"> & { endsAt: string | null }>;
}

/** Offers running now for this corridor and profile. */
export async function activePromotions(db: RailorDb, input: { from: string; to: string; profile?: string | null; now?: Date }): Promise<ActivePromotions> {
  const now = input.now ?? new Date();
  const pair = (source: typeof providerOffers.sourceCurrency, destination: typeof providerOffers.destinationCurrency) => and(
    or(isNull(source), eq(source, input.from)),
    or(isNull(destination), eq(destination, input.to)),
  );
  const [offers] = await Promise.all([
    db.select().from(providerOffers).where(and(
      eq(providerOffers.active, true),
      or(isNull(providerOffers.startsAt), lte(providerOffers.startsAt, now)),
      or(isNull(providerOffers.endsAt), gte(providerOffers.endsAt, now)),
      pair(providerOffers.sourceCurrency, providerOffers.destinationCurrency),
    )).orderBy(asc(providerOffers.createdAt)),
  ]);
  const profile = input.profile ?? null;
  return {
    offers: offers
      .filter((offer) => !offer.profiles?.length || (profile !== null && offer.profiles.includes(profile)))
      .map((offer) => ({ id: offer.id, providerSlug: offer.providerSlug, kind: offer.kind, headline: offer.headline, terms: offer.terms, sourceUrl: offer.sourceUrl, newCustomersOnly: offer.newCustomersOnly, endsAt: offer.endsAt?.toISOString() ?? null })),
  };
}

/* -------------------------------------------------------------------------- */
/* Discount codes                                                              */
/* -------------------------------------------------------------------------- */

export const normalizeDiscountCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");
export const DISCOUNT_CODE_PATTERN = /^[A-Z0-9_-]{3,16}$/;

/** What a code takes off an amount, in cents, never below zero. */
export function priceWithDiscount(code: Pick<DiscountCode, "kind" | "percentBps" | "amountOffCents">, amountCents: number): { chargeCents: number; discountCents: number } {
  const off = code.kind === "percent"
    ? Math.round((amountCents * (code.percentBps ?? 0)) / 10_000)
    : Math.min(amountCents, code.amountOffCents ?? 0);
  const discountCents = Math.max(0, Math.min(amountCents, off));
  return { chargeCents: amountCents - discountCents, discountCents };
}

export type DiscountRefusal = "unknown" | "inactive" | "not_started" | "expired" | "wrong_purchase" | "wrong_plan" | "used_up" | "already_used";

/**
 * Whether this workspace may use the code on this purchase now. A workspace
 * may use a code on up to `cycles` paid checkouts (a plan code worth three
 * months is three monthly checkouts); `max_redemptions` caps everyone's use.
 */
export async function checkDiscountCode(
  db: RailorDb,
  input: { code: string; organizationId: string; purpose: "plan" | "top_up"; plan?: string | null; now?: Date },
): Promise<{ ok: true; code: DiscountCode } | { ok: false; reason: DiscountRefusal }> {
  const now = input.now ?? new Date();
  const value = normalizeDiscountCode(input.code);
  if (!DISCOUNT_CODE_PATTERN.test(value)) return { ok: false, reason: "unknown" };
  const [code] = await db.select().from(discountCodes).where(eq(discountCodes.code, value)).limit(1);
  if (!code) return { ok: false, reason: "unknown" };
  if (!code.active) return { ok: false, reason: "inactive" };
  if (code.startsAt && code.startsAt > now) return { ok: false, reason: "not_started" };
  if (code.endsAt && code.endsAt < now) return { ok: false, reason: "expired" };
  if (code.appliesTo !== "any" && code.appliesTo !== input.purpose) return { ok: false, reason: "wrong_purchase" };
  if (input.purpose === "plan" && code.plans?.length && !code.plans.includes(input.plan ?? "")) return { ok: false, reason: "wrong_plan" };
  const [[total], [mine]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(discountRedemptions).where(eq(discountRedemptions.discountCodeId, code.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(discountRedemptions).where(and(eq(discountRedemptions.discountCodeId, code.id), eq(discountRedemptions.organizationId, input.organizationId))),
  ]);
  if (code.maxRedemptions !== null && (total?.n ?? 0) >= code.maxRedemptions) return { ok: false, reason: "used_up" };
  if ((mine?.n ?? 0) >= code.cycles) return { ok: false, reason: "already_used" };
  return { ok: true, code };
}

/** Each code with how often it has been redeemed and how much it took off. */
export async function discountCodeUsage(db: RailorDb) {
  const [codes, usage, pending] = await Promise.all([
    db.select().from(discountCodes).orderBy(sql`${discountCodes.createdAt} desc`),
    db.select({ id: discountRedemptions.discountCodeId, n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${discountRedemptions.discountCents}), 0)::int` }).from(discountRedemptions).groupBy(discountRedemptions.discountCodeId),
    db.select({ id: billingCheckouts.discountCodeId, n: sql<number>`count(*)::int` }).from(billingCheckouts).where(and(eq(billingCheckouts.status, "pending"), sql`${billingCheckouts.discountCodeId} is not null`)).groupBy(billingCheckouts.discountCodeId),
  ]);
  return codes.map((code) => ({
    code,
    redemptions: usage.find((row) => row.id === code.id)?.n ?? 0,
    discountedCents: usage.find((row) => row.id === code.id)?.cents ?? 0,
    pendingCheckouts: pending.find((row) => row.id === code.id)?.n ?? 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Quote snapshots                                                             */
/* -------------------------------------------------------------------------- */

export interface QuoteSnapshotInput {
  sourceCurrency: string;
  destinationCurrency: string;
  amount: number;
  /** The customer profile the price was checked for. */
  profile: string;
  providerSlug: string;
  providerName: string;
  category?: string | null;
  basis: string;
  rate?: number | null;
  fee?: number | null;
  feeCurrency?: string | null;
  recipientAmount: number;
  midMarketRate?: number | null;
  sourceUrl?: string | null;
}

const fixed = (value: number | null | undefined, digits: number) => value === null || value === undefined || !Number.isFinite(value) ? null : value.toFixed(digits);

/** Keeps today's quote for each provider at this corridor, amount and profile; a later check the same day replaces it. */
export async function recordQuoteSnapshots(db: RailorDb, rows: QuoteSnapshotInput[], now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const values = rows
    .filter((row) => /^[A-Z]{3}$/.test(row.sourceCurrency) && /^[A-Z]{3}$/.test(row.destinationCurrency) && row.amount > 0 && Number.isFinite(row.recipientAmount) && row.recipientAmount > 0)
    .map((row) => ({
      observedOn: day,
      sourceCurrency: row.sourceCurrency,
      destinationCurrency: row.destinationCurrency,
      amount: row.amount.toFixed(2),
      profile: /^(personal|freelancer|business)$/.test(row.profile) ? row.profile : "personal",
      providerSlug: row.providerSlug.slice(0, 64),
      providerName: row.providerName.slice(0, 120),
      category: row.category?.slice(0, 40) ?? null,
      basis: row.basis.slice(0, 40),
      rate: fixed(row.rate, 10),
      fee: fixed(row.fee, 2),
      feeCurrency: row.feeCurrency ?? null,
      recipientAmount: row.recipientAmount.toFixed(2),
      midMarketRate: fixed(row.midMarketRate, 10),
      sourceUrl: row.sourceUrl?.slice(0, 500) ?? null,
      observedAt: now,
    }));
  if (!values.length) return 0;
  await db.insert(quoteSnapshots).values(values).onConflictDoUpdate({
    target: [quoteSnapshots.sourceCurrency, quoteSnapshots.destinationCurrency, quoteSnapshots.amount, quoteSnapshots.profile, quoteSnapshots.providerSlug, quoteSnapshots.observedOn],
    set: {
      providerName: sql`excluded.provider_name`, category: sql`excluded.category`, basis: sql`excluded.basis`, rate: sql`excluded.rate`, fee: sql`excluded.fee`,
      feeCurrency: sql`excluded.fee_currency`, recipientAmount: sql`excluded.recipient_amount`, midMarketRate: sql`excluded.mid_market_rate`, sourceUrl: sql`excluded.source_url`, observedAt: sql`excluded.observed_at`,
    },
  });
  return values.length;
}

export interface SnapshotDay {
  date: string;
  quotes: Array<{ providerSlug: string; providerName: string; category: string | null; basis: string; rate: number | null; fee: number | null; feeCurrency: string | null; recipientAmount: number; midMarketRate: number | null; sourceUrl: string | null }>;
}

/** Amounts Railor has recorded for this corridor since `since`, most recorded first. */
export async function snapshotAmounts(db: RailorDb, input: { from: string; to: string; profile: string; since: string }): Promise<Array<{ amount: number; days: number }>> {
  const rows = await db.select({ amount: quoteSnapshots.amount, days: sql<number>`count(distinct ${quoteSnapshots.observedOn})::int` })
    .from(quoteSnapshots)
    .where(and(eq(quoteSnapshots.sourceCurrency, input.from), eq(quoteSnapshots.destinationCurrency, input.to), eq(quoteSnapshots.profile, input.profile), gte(quoteSnapshots.observedOn, input.since)))
    .groupBy(quoteSnapshots.amount);
  return rows.map((row) => ({ amount: Number(row.amount), days: row.days })).sort((a, b) => b.days - a.days || a.amount - b.amount);
}

/** Recorded quotes for one corridor and amount, grouped by day, oldest first. */
export async function snapshotHistory(db: RailorDb, input: { from: string; to: string; amount: number; profile: string; since: string }): Promise<SnapshotDay[]> {
  const rows = await db.select().from(quoteSnapshots).where(and(
    eq(quoteSnapshots.sourceCurrency, input.from),
    eq(quoteSnapshots.destinationCurrency, input.to),
    inArray(quoteSnapshots.amount, [input.amount.toFixed(2)]),
    eq(quoteSnapshots.profile, input.profile),
    gte(quoteSnapshots.observedOn, input.since),
  )).orderBy(asc(quoteSnapshots.observedOn));
  const days = new Map<string, SnapshotDay>();
  for (const row of rows) {
    const date = String(row.observedOn);
    const day = days.get(date) ?? { date, quotes: [] };
    day.quotes.push({
      providerSlug: row.providerSlug, providerName: row.providerName, category: row.category, basis: row.basis,
      rate: row.rate === null ? null : Number(row.rate), fee: row.fee === null ? null : Number(row.fee), feeCurrency: row.feeCurrency,
      recipientAmount: Number(row.recipientAmount), midMarketRate: row.midMarketRate === null ? null : Number(row.midMarketRate), sourceUrl: row.sourceUrl,
    });
    days.set(date, day);
  }
  return [...days.values()];
}
