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
export function pricingSourceLabel(row: PriceRow): string {
  return row.publicOffer ? "First-transfer offer" : row.basis === "market_estimate" && row.publicComparison ? "Public comparison" : { exact: "Your account", live_public: "Public reference", published: "Published estimate", market_estimate: "Market estimate" }[row.basis];
}
