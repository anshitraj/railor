import "server-only";
import type { PriceCheckInput, PriceCheckResult } from "@railor/core";
import type { MailMessage } from "./mail";
import { renderRateChart } from "./emails/rate-chart";
import { createRateUpdateEmail } from "./emails/rate-update";
import { goHref } from "./provider-go";
import type { AlertFrequency, Plan } from "./plans";
import { completePrices, type DigestReason } from "./rate-alert-rules";
import { loadRateHistory } from "./rate-history";

export interface ComposeInput {
  to: string;
  priceInput: Pick<PriceCheckInput, "sourceCurrency" | "destinationCurrency" | "amount">;
  result: Pick<PriceCheckResult, "rows" | "reference">;
  /** Watch one provider only, for a saved provider corridor. */
  providerSlug?: string;
  frequency: AlertFrequency;
  reason: DigestReason;
  previousAmount: number | null;
  plan: Plan | null;
  origin: string;
  compareUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
}

/** The mid-market rate over the last 30 days as a picture and a caption, or null when it can't be drawn. */
async function thirtyDayChart(from: string, to: string): Promise<{ png: Buffer; caption: string } | null> {
  try {
    const history = await loadRateHistory({ mode: "bank", from, to, days: 30 });
    const points = history.points.flatMap((point) => (point.rate === null ? [] : [{ date: point.date, rate: point.rate }]));
    const png = await renderRateChart(points);
    return png ? { png, caption: `Evolution of the ${from} to ${to} mid-market rate over the past 30 days (${history.source})` } : null;
  } catch {
    return null;
  }
}

/**
 * Builds one rate update from a price check: the cheapest providers with their
 * redirect links, today's mid-market rate and its 30-day chart. Returns null
 * when no provider has a complete price, so nobody is emailed an empty update.
 */
export async function composeRateUpdate(input: ComposeInput): Promise<MailMessage | null> {
  const { sourceCurrency: from, destinationCurrency: to, amount } = input.priceInput;
  const prices = completePrices(input.result.rows as never, input.providerSlug);
  if (!prices.length) return null;
  const offers = prices.slice(0, 3).map((price) => {
    const path = goHref(price.providerSlug, { from, to, amount });
    return { ...price, href: path ? `${input.origin}${path}` : null };
  });
  return createRateUpdateEmail({
    to: input.to, from, toCurrency: to, amount, frequency: input.frequency, reason: input.reason,
    offers, compared: prices.length, reference: input.result.reference?.rate ?? null,
    chart: await thirtyDayChart(from, to), previousAmount: input.previousAmount, plan: input.plan,
    compareUrl: input.compareUrl, manageUrl: input.manageUrl, unsubscribeUrl: input.unsubscribeUrl, plansUrl: `${input.origin}/pricing`,
  });
}
