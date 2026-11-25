import type { CustomerContext, PriceCheckInput } from "@railor/core";

/** Keep an account's country. For an anonymous outbound USD comparison use the US sender market. */
export function defaultPriceCountry(entity: string | null | undefined, from: string, direction: "send" | "receive") {
  return entity || (direction === "send" && from === "USD" ? "US" : "IN");
}

/** A unique local currency is a useful default; shared currencies need a country choice. */
export function priceDestination(input: PriceCheckInput, currencyByCountry: Record<string, string>) {
  if (input.destinationCountry) return input.destinationCountry.toUpperCase();
  if (input.context?.direction === "receive" && currencyByCountry[input.context.country] === input.destinationCurrency.toUpperCase()) return input.context.country;
  const matches = Object.entries(currencyByCountry).filter(([, currency]) => currency === input.destinationCurrency.toUpperCase());
  return matches.length === 1 ? matches[0]![0] : undefined;
}

/** Whether a pair is one the account receives: Indian (or anonymous) accounts receive INR; everything else is sending. */
export function pairDirection(entity: string | null | undefined, to: string): "send" | "receive" {
  return (!entity || entity === "IN") && to === "INR" ? "receive" : "send";
}

/**
 * The context for a new currency pair. Swapping USD→INR to INR→USD turns a
 * receiving check into a sending one, so the India receiving rules and the
 * payer's payment method must not carry over; the profile and purpose do.
 */
export function contextForPair(context: CustomerContext, entity: string | null | undefined, from: string, to: string): CustomerContext {
  const direction = pairDirection(entity, to);
  const country = defaultPriceCountry(entity, from, direction);
  if (direction === "send") {
    const { paymentMethod: _dropped, ...rest } = context;
    return { ...rest, direction, country };
  }
  const paymentMethod = context.direction === "receive" && context.paymentMethod
    ? context.paymentMethod
    : context.profile === "personal" ? "transfer_service" : "local_bank";
  return { ...context, direction, country, paymentMethod };
}
