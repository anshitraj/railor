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

export type PriceStatusKind = "comparable" | "offer" | "confirm";

/**
 * One plain status per price, so a payout figure never looks firmer than it
 * is: a complete price that can be compared like for like, a first-transfer
 * offer, or a figure the provider still has to confirm (and why).
 */
export function priceStatus(row: PriceRow): { kind: PriceStatusKind; label: string; reason: string } {
  if (row.publicOffer) return { kind: "offer", label: "First-transfer offer", reason: `Only for a first transfer paid by ${row.publicOffer.fundingMethod}. Later transfers cost more.` };
  const reason = row.missing?.[0]
    ?? (row.basis === "market_estimate" ? "A comparison site's estimate, not the provider's own quote."
      : row.profileAssessment?.priceApplicable === false ? row.profileAssessment.reasons[0] ?? "This price may not apply to your account."
        : row.costComplete === false ? "Part of the cost isn't published."
          : row.publicComparison ? "Observed for another sender country or funding method."
            : row.partial ? row.profileAssessment?.reasons[0] ?? "The provider has to confirm your account and route."
              : null);
  return reason ? { kind: "confirm", label: "Confirm at provider", reason } : { kind: "comparable", label: "Comparable price", reason: "A complete price for this amount, comparable with the others." };
}

/** When this specific price was collected, short enough for a row. */
export function priceCollectedLabel(row: Pick<PriceRow, "observedAt" | "basis">): string {
  const date = new Date(row.observedAt);
  if (!row.observedAt || Number.isNaN(date.getTime())) return "Time not given by source";
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return row.basis === "published" ? `Fee schedule from ${day}` : `Collected ${day}, ${time} UTC`;
}
