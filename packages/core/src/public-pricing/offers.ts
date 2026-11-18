import captured from "./public-offers.json";
import { usBankRemittanceCorridor } from "./us-bank-remittances.js";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

/** Real calculator captures are exact-amount observations, with a hard freshness limit. */
export function publicOfferRows(input: PriceCheckInput, now: Date): PriceRow[] {
  if (!usBankRemittanceCorridor(input)) return [];
  return captured.observations.filter(offer => offer.amount === input.amount && offer.sourceCurrency === input.sourceCurrency
    && offer.destinationCurrency === input.destinationCurrency
    && (!input.destinationCountry || offer.destinationCountry === input.destinationCountry)
    && (input.context!.direction === "receive" ? input.context!.country === offer.destinationCountry : input.context!.country === offer.senderCountry)
    && Date.parse(offer.observedAt) <= now.getTime() && now.getTime() - Date.parse(offer.observedAt) < 86_400_000
    && now.getTime() < Date.parse(offer.displayUntil))
    .map(offer => ({
      providerSlug: offer.providerSlug, providerName: offer.providerName, basis: "live_public",
      senderCountry: offer.senderCountry, paymentMethods: ["local_bank", "transfer_service"], side: "payer",
      product: { id: offer.providerSlug + ":usd-" + offer.destinationCurrency.toLowerCase() + "-bank", label: offer.providerName + " · US bank-funded welcome offer" },
      recipientAmount: offer.recipientAmount, feeAmount: offer.feeAmount, feeCurrency: offer.feeCurrency,
      rate: offer.rate, totalCostPct: null, partial: true, delivery: null, observedAt: offer.observedAt,
      source: { label: "Public calculator · first-transfer offer", url: offer.sourceUrl }, notes: offer.conditions,
      publicOffer: { kind: "first_transfer", fundingMethod: offer.fundingMethod, payoutMethod: offer.payoutMethod, displayUntil: offer.displayUntil },
    }));
}
