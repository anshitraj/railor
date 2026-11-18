import type { CustomerContext, PriceCheckResult } from "@railor/core";

/** A slow response for a previous amount, pair or profile must never price the current inputs. */
export function priceResponseMatches(result: Pick<PriceCheckResult, "input"> | null, request: { from: string; to: string; amount: number; market: boolean; context: CustomerContext }) {
  if (!result || !Number.isFinite(request.amount) || request.amount <= 0) return false;
  const input = result.input;
  const context = input.context;
  return input.sourceCurrency === request.from && input.destinationCurrency === request.to && input.amount === request.amount
    && Boolean(input.includeMarket) === request.market && Boolean(context)
    && (["profile", "country", "direction", "purpose", "paymentMethod"] as const).every((key) => context?.[key] === request.context[key]);
}

/** A customer context as query parameters, leaving out fields that aren't set (never the string "undefined"). */
export function contextParams(context: CustomerContext): Record<string, string> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => typeof value === "string" && value !== ""));
}
