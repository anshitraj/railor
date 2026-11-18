import type { PriceCheckInput, PriceCheckResult, PriceRow } from "@railor/core";
import { priceView } from "./price-view";

export interface LockedPriceProvider {
  providerSlug: string;
  providerName: string;
  logoUrl?: string;
  basis: PriceRow["basis"];
}

/**
 * What a signed-out visitor receives from a price check: which providers were
 * checked, never what any of them charges. Amounts, fees, rates, the mid-market
 * reference and the ranking stay on the server, so a blurred preview can't be
 * un-blurred in the browser. Providers are listed alphabetically (comparable
 * prices first, then estimates) so the order doesn't reveal which is cheapest.
 */
export interface LockedPriceCheck {
  locked: true;
  input: PriceCheckInput;
  generatedAt: string;
  /** Options this profile can use (live, published and dated estimates). */
  providerCount: number;
  /** Options hidden because they don't serve this profile. */
  hiddenCount: number;
  providers: LockedPriceProvider[];
}

export function lockPriceCheck(result: PriceCheckResult, now = Date.now()): LockedPriceCheck {
  const { quotes, estimates, excluded } = priceView(result, now);
  const options = [...quotes, ...estimates].filter((row) => row.recipientAmount !== null);
  const providers = [...new Map(options.map((row) => [row.providerSlug, row])).values()]
    .map((row) => ({ providerSlug: row.providerSlug, providerName: row.providerName.split(" · ")[0]!, ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}), basis: row.basis }))
    // Comparable prices before dated consumer estimates; alphabetical within each group, so nothing hints at the winner.
    .sort((a, b) => Number(a.basis === "market_estimate") - Number(b.basis === "market_estimate") || a.providerName.localeCompare(b.providerName));
  return { locked: true, input: result.input, generatedAt: result.generatedAt, providerCount: providers.length, hiddenCount: excluded.length, providers: providers.slice(0, 6) };
}

export function isLockedPriceCheck(value: unknown): value is LockedPriceCheck {
  return Boolean(value && typeof value === "object" && (value as { locked?: unknown }).locked === true);
}
