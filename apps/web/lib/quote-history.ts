import "server-only";
import type { PriceCheckInput, PriceRow } from "@railor/core";
import { activePromotions, getDb, recordQuoteSnapshots, type ActivePromotions, type QuoteSnapshotInput } from "@railor/database";

/**
 * Daily quote history: every price check Railor runs keeps that day's quote
 * per provider (one row per provider, corridor, amount and UTC day), so the
 * history chart can draw what arrived on days Railor actually priced, and
 * leave the rest empty.
 */

// Public prices only: an "exact" quote comes from one workspace's own connected account.
const RECORDED_BASES = new Set(["live_public", "published", "market_estimate"]);

// A bank, by name: catalog slugs collide too often (a fintech can share a slug with a listed bank) to trust them here.
const BANK_NAME = /\b(bank|banco|banque|chase|wells fargo|citi(bank)?|hsbc|barclays|lloyds|natwest|santander|bnp|deutsche|icici|hdfc|axis|kotak|sbi|td|rbc|scotiabank|bmo|cibc|emirates nbd|adcb|fab)\b/i;
function providerCategory(row: Pick<PriceRow, "providerName">): "bank" | "transfer" {
  return BANK_NAME.test(row.providerName) ? "bank" : "transfer";
}

// When a provider appears twice (its own live price and a comparison feed's estimate), keep the stronger source.
const BASIS_RANK: Record<string, number> = { live_public: 0, published: 1, market_estimate: 2 };
const nameKey = (name: string) => (name.split(" · ")[0] ?? name).toLowerCase().replace(/\s*\(.*?\)\s*/g, "").replace(/[^a-z0-9]+/g, "");

/** The rows worth keeping: a real amount, usable by this profile, one per provider. */
export function snapshotRows(input: Pick<PriceCheckInput, "sourceCurrency" | "destinationCurrency" | "amount"> & { profile?: string | null }, rows: PriceRow[], referenceRate: number | null): QuoteSnapshotInput[] {
  const usable = rows
    .filter((row) => row.recipientAmount !== null && row.recipientAmount > 0 && RECORDED_BASES.has(row.basis) && row.profileAssessment?.status !== "not_supported")
    .sort((a, b) => (BASIS_RANK[a.basis] ?? 9) - (BASIS_RANK[b.basis] ?? 9) || b.recipientAmount! - a.recipientAmount!);
  const seen = new Set<string>();
  const out: QuoteSnapshotInput[] = [];
  for (const row of usable) {
    const key = nameKey(row.providerName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sourceCurrency: input.sourceCurrency,
      destinationCurrency: input.destinationCurrency,
      amount: input.amount,
      profile: input.profile ?? "personal",
      providerSlug: row.providerSlug,
      providerName: row.providerName.split(" · ")[0] ?? row.providerName,
      category: providerCategory(row),
      basis: row.basis,
      rate: row.rate,
      fee: row.feeAmount,
      feeCurrency: row.feeCurrency,
      recipientAmount: row.recipientAmount!,
      midMarketRate: referenceRate,
      sourceUrl: row.source.url ?? row.rateSource?.url ?? null,
    });
  }
  return out;
}

/** Saves today's quotes; failures never reach the person checking a price. */
export async function recordPriceCheck(input: Pick<PriceCheckInput, "sourceCurrency" | "destinationCurrency" | "amount"> & { profile?: string | null }, rows: PriceRow[], referenceRate: number | null): Promise<number> {
  try {
    return await recordQuoteSnapshots(await getDb(), snapshotRows(input, rows, referenceRate));
  } catch (error) {
    console.error("[quote-history]", error instanceof Error ? error.message : error);
    return 0;
  }
}

const NO_PROMOTIONS: ActivePromotions = { offers: [] };

/** Provider offers for this corridor; an empty set if they can't load. */
export async function promotionsFor(input: { from: string; to: string; profile?: string | null }): Promise<ActivePromotions> {
  try {
    return await activePromotions(await getDb(), input);
  } catch (error) {
    console.error("[promotions]", error instanceof Error ? error.message : error);
    return NO_PROMOTIONS;
  }
}
