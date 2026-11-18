import type { PriceCheckInput } from "@railor/core";

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
