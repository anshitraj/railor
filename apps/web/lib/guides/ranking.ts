import type { PriceCheckResult, PriceRow } from "@railor/core";
import { providerIdentity, pricingSourceLabel } from "../price-display";
import { priceView } from "../price-view";

export interface RankedProvider {
  slug: string;
  name: string;
  logoUrl?: string;
  /** What the recipient receives, in the destination currency. */
  amount: number;
  /** Where the price comes from, in the words the price check uses. */
  label: string;
  /** A better rate offered to new customers on a first transfer. */
  offer: boolean;
  /** A dated consumer estimate rather than a current price. */
  dated: boolean;
  delivery: string | null;
  /** Share of the amount lost to fees and the exchange rate, when every cost is known. */
  costPct: number | null;
}

const describe = (row: PriceRow): RankedProvider => ({
  slug: providerIdentity(row.providerSlug),
  name: row.providerName.split(" · ")[0]!,
  ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
  amount: row.recipientAmount!,
  label: row.basis === "market_estimate" ? "Dated estimate" : pricingSourceLabel(row),
  offer: Boolean(row.publicOffer),
  dated: row.basis === "market_estimate",
  delivery: row.delivery,
  costPct: row.partial || row.costComplete === false || row.totalCostPct === null ? null : row.totalCostPct,
});

/**
 * The providers a person could use, best first: current prices ordered by what
 * arrives, then dated estimates (never ranked above a current price), one row
 * per provider. Uses the same visibility rules as every other price screen.
 */
export function rankProviders(result: PriceCheckResult | null, now: number, limit = 10): RankedProvider[] {
  const { quotes, estimates } = priceView(result, now);
  const priced = [...quotes, ...estimates].filter((row) => row.recipientAmount !== null);
  const byAmount = (a: PriceRow, b: PriceRow) => b.recipientAmount! - a.recipientAmount!;
  const ordered = [
    ...priced.filter((row) => row.basis !== "market_estimate").sort(byAmount),
    ...priced.filter((row) => row.basis === "market_estimate").sort(byAmount),
  ];
  const seen = new Set<string>();
  const ranked: RankedProvider[] = [];
  for (const row of ordered) {
    const provider = describe(row);
    if (seen.has(provider.slug)) continue;
    seen.add(provider.slug);
    ranked.push(provider);
    if (ranked.length === limit) break;
  }
  return ranked;
}
