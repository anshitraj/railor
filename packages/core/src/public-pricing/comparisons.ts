import type { PriceCheckInput, PriceRow } from "../pricing.js";

/** Public observations keep their original amount, countries and collection time. */
export interface ComparisonFeed {
  amount?: number;
  sourceCurrency?: string;
  targetCurrency?: string;
  providers?: Array<{
    alias?: string; name?: string; type?: string;
    logos?: { normal?: { svgUrl?: string | null; pngUrl?: string | null }; circle?: { svgUrl?: string | null } };
    quotes?: Array<{ rate?: number; fee?: number; receivedAmount?: number; dateCollected?: string; sourceCountry?: string | null; targetCountry?: string | null }>;
  }>;
}
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const country = (value: unknown) => typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : null;

export function comparisonRows(input: PriceCheckInput, body: ComparisonFeed): PriceRow[] {
  // Never rescale a sample or accept a response for another amount/pair.
  if ((body.amount !== undefined && body.amount !== input.amount)
    || (body.sourceCurrency !== undefined && body.sourceCurrency !== input.sourceCurrency)
    || (body.targetCurrency !== undefined && body.targetCurrency !== input.destinationCurrency)) return [];
  return (body.providers ?? []).flatMap((provider): PriceRow[] => {
    if (!provider.alias || provider.alias === "wise") return [];
    const quote = provider.quotes?.find(q => positive(q.receivedAmount) && (q.rate === undefined || positive(q.rate)));
    if (!quote) return [];
    const fee = typeof quote.fee === "number" && Number.isFinite(quote.fee) && quote.fee >= 0 && quote.fee < input.amount ? quote.fee : null;
    const time = quote.dateCollected ? Date.parse(quote.dateCollected) : NaN;
    const checkedAmount = body.amount === input.amount && body.sourceCurrency === input.sourceCurrency && body.targetCurrency === input.destinationCurrency;
    const hasCollectionTime = typeof quote.dateCollected === "string" && /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(quote.dateCollected);
    const rate = positive(quote.rate) ? quote.rate : null;
    const arithmeticMatches = fee !== null && rate !== null && Math.abs((input.amount - fee) * rate - quote.receivedAmount!) <= Math.max(.02, quote.receivedAmount! * .00001);
    const sourceCountry = country(quote.sourceCountry), targetCountry = country(quote.targetCountry);
    return [{
      providerSlug: `market:${provider.alias}`, providerName: provider.name ?? provider.alias,
      logoUrl: provider.logos?.circle?.svgUrl ?? provider.logos?.normal?.svgUrl ?? provider.logos?.normal?.pngUrl ?? undefined,
      basis: "market_estimate", recipientAmount: quote.receivedAmount!, feeAmount: fee, feeCurrency: input.sourceCurrency,
      rate, totalCostPct: null, partial: !arithmeticMatches, delivery: null,
      observedAt: Number.isFinite(time) ? new Date(time).toISOString() : "",
      source: { label: "Wise public comparison", url: "https://wise.com/gb/compare/" },
      ...(checkedAmount && arithmeticMatches && hasCollectionTime && Number.isFinite(time) ? { publicComparison: {
        amount: input.amount, sourceCurrency: input.sourceCurrency, destinationCurrency: input.destinationCurrency,
        sourceCountry, destinationCountry: targetCountry, freshUntil: new Date(time + 86_400_000).toISOString(),
      } } : {}),
      notes: [
        `Collected by Wise from ${provider.name ?? provider.alias}'s public pricing. This is a dated third-party observation, not a provider account quote.`,
        `Observed corridor: ${sourceCountry ?? "sender country not supplied"} → ${targetCountry ?? "recipient country not supplied"}.`,
        "Consumer reference. Funding method, first-transfer promotions and customer eligibility are not supplied by this feed. Confirm them with the provider; business pricing may differ.",
      ],
    }];
  });
}
