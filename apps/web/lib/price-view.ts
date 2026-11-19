import type { PriceCheckResult, PriceRow } from "@railor/core";
import { freshComparison, providerIdentity } from "./price-display";

/**
 * Which rows of a price check a person may see, and which one is best.
 *
 * Shared by every price surface (the full price check, the homepage
 * calculator and the workspace quick quote) so a provider hidden for a
 * profile on one screen is never shown as "best" on another:
 *   - rows the profile rules say this person cannot use are excluded;
 *   - expired quotes and expired public offers disappear;
 *   - a consumer estimate only counts as a quote when it is fresh and
 *     describes exactly this request.
 */
export function priceView(result: PriceCheckResult | null, now: number) {
  if (!result) return { quotes: [] as PriceRow[], estimates: [] as PriceRow[], excluded: [] as PriceRow[], best: null as PriceRow | null };
  const visible = (row: PriceRow) =>
    row.profileAssessment?.status !== "not_supported" &&
    (!row.expiresAt || Date.parse(row.expiresAt) > now) &&
    (!row.publicOffer || Date.parse(row.publicOffer.displayUntil) > now);
  const currentProviders = new Set(result.rows.filter(row => row.basis !== "market_estimate" && row.recipientAmount !== null && visible(row)).map(row => providerIdentity(row.providerSlug)));
  const quotes = result.rows.filter((row) =>
    (row.basis !== "market_estimate" || (freshComparison(row, result.input, now) && !currentProviders.has(providerIdentity(row.providerSlug)))) &&
    visible(row));
  const estimates = result.rows.filter((row) => row.basis === "market_estimate" && !quotes.some((quote) => quote.providerSlug === row.providerSlug) && visible(row));
  const excluded = result.rows.filter((row) => row.profileAssessment?.status === "not_supported");
  const best = quotes.find((row) => row.shortfall === 0) ?? null;
  return { quotes, estimates, excluded, best };
}

/** Plain-language data status for a basis (rows with a known completeness use pricingSourceLabel). */
export const BASIS_LABEL: Record<PriceRow["basis"], string> = {
  exact: "Account quote",
  live_public: "Market reference",
  published: "Published estimate",
  market_estimate: "Market reference",
};
