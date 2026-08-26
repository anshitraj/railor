/**
 * Failover + intelligent routing over live quotes.
 *
 * Requests a quote from every connected, quote-capable provider in
 * parallel, tolerates individual failures without failing the whole
 * request (failover), then ranks whatever came back by the requested
 * preset and returns the winner alongside a full audit trail — every
 * provider tried, skipped or failed, and why, not just the one that won.
 */
import type { RankingPreset } from "@railor/types";
import type { ProviderAdapter } from "./adapters.js";
import type { QuoteRequest, RoutingAttempt, RoutingResult, UnifiedQuote } from "./unified.js";

export interface RoutableProvider {
  slug: string;
  name: string;
  adapter: ProviderAdapter | null;
  credentials: Record<string, string> | null;
}

function rankQuotes(quotes: UnifiedQuote[], preset: RankingPreset): UnifiedQuote[] {
  const withFee = quotes.filter((q) => q.feeAmount !== undefined);
  const withEta = quotes.filter((q) => q.estimatedArrivalMinutes !== undefined);

  if (preset === "cheapest" && withFee.length) {
    return [...quotes].sort((a, b) => (a.feeAmount ?? Infinity) - (b.feeAmount ?? Infinity));
  }
  if (preset === "fastest" && withEta.length) {
    return [...quotes].sort(
      (a, b) => (a.estimatedArrivalMinutes ?? Infinity) - (b.estimatedArrivalMinutes ?? Infinity),
    );
  }
  // "balanced" and every preset without enough data to specialize on:
  // normalize fee and ETA to a comparable 0-1 range and weight them evenly,
  // so one dimension with wildly different units never silently dominates.
  const maxFee = Math.max(1e-9, ...withFee.map((q) => q.feeAmount!));
  const maxEta = Math.max(1e-9, ...withEta.map((q) => q.estimatedArrivalMinutes!));
  return [...quotes].sort((a, b) => {
    const scoreA = (a.feeAmount ?? maxFee) / maxFee + (a.estimatedArrivalMinutes ?? maxEta) / maxEta;
    const scoreB = (b.feeAmount ?? maxFee) / maxFee + (b.estimatedArrivalMinutes ?? maxEta) / maxEta;
    return scoreA - scoreB;
  });
}

export async function routeQuote(
  providers: RoutableProvider[],
  request: QuoteRequest,
  preset: RankingPreset = "balanced",
): Promise<RoutingResult> {
  const attempts: RoutingAttempt[] = [];

  const quotes = (
    await Promise.all(
      providers.map(async (p): Promise<UnifiedQuote | null> => {
        if (!p.adapter?.getQuote) {
          attempts.push({ providerSlug: p.slug, providerName: p.name, outcome: "skipped", detail: "No quote support for this provider yet." });
          return null;
        }
        if (!p.credentials) {
          attempts.push({ providerSlug: p.slug, providerName: p.name, outcome: "skipped", detail: "Not connected." });
          return null;
        }
        try {
          const quote = await p.adapter.getQuote(p.credentials, request);
          attempts.push({ providerSlug: p.slug, providerName: p.name, outcome: "quoted", detail: "Quote received.", quote });
          return quote;
        } catch (error) {
          attempts.push({
            providerSlug: p.slug,
            providerName: p.name,
            outcome: "failed",
            detail: error instanceof Error ? error.message : "Quote request failed.",
          });
          return null;
        }
      }),
    )
  ).filter((q): q is UnifiedQuote => q !== null);

  const ranked = rankQuotes(quotes, preset);

  return { preset, selected: ranked[0] ?? null, attempts };
}
