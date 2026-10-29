import type { CustomerContext, PriceCheckResult } from "@railor/core";

/** A slow response for a previous amount, pair or profile must never price the current inputs. */
export function priceResponseMatches(result: PriceCheckResult | null, request: { from: string; to: string; amount: number; market: boolean; context: CustomerContext }) {
  if (!result || !Number.isFinite(request.amount) || request.amount <= 0) return false;
  const input = result.input;
  const context = input.context;
  return input.sourceCurrency === request.from && input.destinationCurrency === request.to && input.amount === request.amount
    && Boolean(input.includeMarket) === request.market && Boolean(context)
    && (["profile", "country", "direction", "purpose"] as const).every((key) => context?.[key] === request.context[key]);
}
