import captured from "./public-offers.json";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

/** Real calculator captures are exact-amount observations, with a hard freshness limit. */
export function publicOfferRows(input: PriceCheckInput, now: Date): PriceRow[] {
  if (input.context?.profile !== "personal" || input.context.purpose !== "personal") return [];
  return captured.observations.filter(offer => offer.amount === input.amount && offer.sourceCurrency === input.sourceCurrency
    && offer.destinationCurrency === input.destinationCurrency
    && (!input.destinationCountry || offer.destinationCountry === input.destinationCountry)
    && (input.context!.direction === "receive" ? input.context!.country === offer.destinationCountry : input.context!.country === offer.senderCountry)
    && Date.parse(offer.observedAt) <= now.getTime() && now.getTime() - Date.parse(offer.observedAt) < 86_400_000
    && now.getTime() < Date.parse(offer.displayUntil))
    .map(offer => ({
      providerSlug: offer.providerSlug, providerName: offer.providerName, basis: "live_public",
      recipientAmount: offer.recipientAmount, feeAmount: offer.feeAmount, feeCurrency: offer.feeCurrency,
      rate: offer.rate, totalCostPct: null, partial: true, delivery: null, observedAt: offer.observedAt,
      source: { label: "Public calculator · first-transfer offer", url: offer.sourceUrl }, notes: offer.conditions,
      publicOffer: { kind: "first_transfer", fundingMethod: offer.fundingMethod, payoutMethod: offer.payoutMethod, displayUntil: offer.displayUntil },
    }));
}
