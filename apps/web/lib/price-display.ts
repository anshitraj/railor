import type { PriceCheckInput, PriceRow } from "@railor/core";

/** Fresh consumer observations belong beside prices, with their origin and conditions intact. */
export function freshComparison(row: PriceRow, input: PriceCheckInput, now: number): boolean {
  const reference = row.publicComparison;
  if (row.basis !== "market_estimate" || !reference || row.partial || row.costComplete === false
    || input.context?.profile !== "personal" || input.context.purpose !== "personal"
    || row.webChecks?.some(check => check.state === "contradicted")) return false;
  const observed = Date.parse(row.observedAt), until = Date.parse(reference.freshUntil);
  if (!Number.isFinite(observed) || !Number.isFinite(until) || observed > now + 60_000 || now >= until
    || now - observed > 86_400_000 || until - observed > 86_400_000
    || reference.amount !== input.amount || reference.sourceCurrency !== input.sourceCurrency
    || reference.destinationCurrency !== input.destinationCurrency) return false;
  const destination = input.destinationCountry ?? (input.context.direction === "receive" ? input.context.country : undefined);
  if (destination && destination !== reference.destinationCountry) return false;
  // For sending, a price collected for a different sender country cannot describe this user.
  if (input.context.direction === "send" && reference.sourceCountry !== input.context.country) return false;
  return true;
}

export function providerIdentity(slug: string): string { return slug.replace(/^market:/, "").toLowerCase(); }

/** One provider can return different checkout and receiving-account products. */
export function priceRowKey(row: PriceRow): string {
  return [row.providerSlug, row.product?.id ?? row.side ?? "", row.basis].join("/");
}
/**
 * Data status in plain words: an account quote (from the customer's own
 * connected account), a published estimate (the provider's published fees,
 * complete), a partial estimate (published, with a cost still unknown), or a
 * market reference (a public quote or a dated consumer price).
 */
export function pricingSourceLabel(row: PriceRow): string {
  if (row.publicOffer) return "First-transfer offer";
  if (row.basis === "exact") return "Account quote";
  if (row.basis === "published") return row.partial ? "Partial estimate" : "Published estimate";
  return "Market reference";
}
