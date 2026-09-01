/**
 * Failover + intelligent routing over live quotes.
 *
 * Requests a quote from every connected, quote-capable provider in
 * parallel, tolerates individual failures without failing the whole
 * request (failover), then ranks whatever came back by the requested
 * preset and returns the winner alongside a full audit trail — every
 * provider tried, skipped or failed, and why, not just the one that won.
 *
 * Ranking is fully deterministic — no LLM ever chooses the winner. Missing
 * data drops a candidate to the back for that one dimension rather than
 * being defaulted to a fabricated middle value, and a fee whose provider
 * response didn't break out every component (`costPartial: true`) is never
 * compared to a confirmed total as if the two numbers meant the same thing.
 */
import type { RankingPreset } from "@railor/types";
import type { ProviderAdapter } from "./adapters.js";
import type { QuoteRequest, RoutingAttempt, RoutingResult, UnifiedQuote } from "./unified.js";

export interface RoutableProvider {
  slug: string;
  name: string;
  adapter: ProviderAdapter | null;
  credentials: Record<string, string> | null;
  /** Real observed health ratio (see ProviderInput.healthOkRatio) — null/undefined when Railor has zero health observations for this provider, never defaulted to a fabricated value. Feeds only "most_reliable" and the "balanced" blend. */
  healthOkRatio?: number | null;
}

interface RankableQuote {
  quote: UnifiedQuote;
  healthOkRatio: number | null;
}

interface RankResult {
  ranked: UnifiedQuote[];
  rankingConfidence: number;
  rankingInputsUsed: string[];
  rankingInputsMissing: string[];
}

const EMPTY_RANK: RankResult = { ranked: [], rankingConfidence: 0, rankingInputsUsed: [], rankingInputsMissing: [] };

/** A fee is only a trustworthy "cost" input once it's a confirmed total, not a partial sum the provider's response happened to expose. */
const INPUT_CHECKERS: Record<string, (c: RankableQuote) => boolean> = {
  cost: (c) => c.quote.feeAmount !== undefined && !c.quote.costPartial,
  recipientAmount: (c) => c.quote.recipientAmount !== undefined,
  eta: (c) => c.quote.estimatedArrivalMinutes !== undefined,
  reliability: (c) => c.healthOkRatio !== null,
};

/** Reports how much of a preset's real inputs were actually available for the winner — never a fabricated confidence number. */
function rankingMetaFor(
  winner: RankableQuote | undefined,
  relevantInputs: string[],
): Pick<RankResult, "rankingConfidence" | "rankingInputsUsed" | "rankingInputsMissing"> {
  if (!winner || !relevantInputs.length) return { rankingConfidence: 0, rankingInputsUsed: [], rankingInputsMissing: [] };
  const used = relevantInputs.filter((key) => INPUT_CHECKERS[key]!(winner));
  const missing = relevantInputs.filter((key) => !INPUT_CHECKERS[key]!(winner));
  return { rankingConfidence: Math.round((used.length / relevantInputs.length) * 100) / 100, rankingInputsUsed: used, rankingInputsMissing: missing };
}

/** 0 = confirmed total, 1 = known but partial, 2 = unknown — cheapest must never let an incomplete number outrank a complete one just because it looks smaller. */
function costTier(q: UnifiedQuote): number {
  if (q.feeAmount === undefined) return 2;
  return q.costPartial ? 1 : 0;
}

function byCost(a: RankableQuote, b: RankableQuote): number {
  const tierDiff = costTier(a.quote) - costTier(b.quote);
  if (tierDiff !== 0) return tierDiff;
  return (a.quote.feeAmount ?? Infinity) - (b.quote.feeAmount ?? Infinity);
}

function byRecipientAmount(a: RankableQuote, b: RankableQuote): number {
  const aKnown = a.quote.recipientAmount !== undefined;
  const bKnown = b.quote.recipientAmount !== undefined;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  return (b.quote.recipientAmount ?? 0) - (a.quote.recipientAmount ?? 0);
}

function byEta(a: RankableQuote, b: RankableQuote): number {
  const aKnown = a.quote.estimatedArrivalMinutes !== undefined;
  const bKnown = b.quote.estimatedArrivalMinutes !== undefined;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  return (a.quote.estimatedArrivalMinutes ?? Infinity) - (b.quote.estimatedArrivalMinutes ?? Infinity);
}

function byReliability(a: RankableQuote, b: RankableQuote): number {
  const aKnown = a.healthOkRatio !== null;
  const bKnown = b.healthOkRatio !== null;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  return (b.healthOkRatio ?? 0) - (a.healthOkRatio ?? 0);
}

function rankQuotes(candidates: RankableQuote[], preset: RankingPreset): RankResult {
  if (!candidates.length) return EMPTY_RANK;

  if (preset === "cheapest") {
    const sorted = [...candidates].sort(byCost);
    return { ranked: sorted.map((c) => c.quote), ...rankingMetaFor(sorted[0], ["cost"]) };
  }
  if (preset === "fastest") {
    const sorted = [...candidates].sort(byEta);
    return { ranked: sorted.map((c) => c.quote), ...rankingMetaFor(sorted[0], ["eta"]) };
  }
  if (preset === "max_recipient_amount") {
    const sorted = [...candidates].sort(byRecipientAmount);
    return { ranked: sorted.map((c) => c.quote), ...rankingMetaFor(sorted[0], ["recipientAmount"]) };
  }
  if (preset === "most_reliable") {
    const sorted = [...candidates].sort(byReliability);
    return { ranked: sorted.map((c) => c.quote), ...rankingMetaFor(sorted[0], ["reliability"]) };
  }

  // "balanced" (and the two provider-search-only presets, which have no
  // live-quote analogue and fall back here): normalize whatever of
  // cost/eta/reliability is actually known per candidate and average evenly.
  // A missing — or merely partial-cost — dimension drops out of that
  // candidate's average instead of being defaulted to a fabricated midpoint.
  const completeCostQuotes = candidates.filter((c) => INPUT_CHECKERS.cost!(c));
  const etaQuotes = candidates.filter((c) => INPUT_CHECKERS.eta!(c));
  const maxFee = Math.max(1e-9, ...completeCostQuotes.map((c) => c.quote.feeAmount!));
  const maxEta = Math.max(1e-9, ...etaQuotes.map((c) => c.quote.estimatedArrivalMinutes!));

  const compositeOf = (c: RankableQuote): number => {
    const parts: number[] = [];
    if (INPUT_CHECKERS.cost!(c)) parts.push(1 - c.quote.feeAmount! / maxFee);
    if (INPUT_CHECKERS.eta!(c)) parts.push(1 - c.quote.estimatedArrivalMinutes! / maxEta);
    if (c.healthOkRatio !== null) parts.push(c.healthOkRatio);
    return parts.length ? parts.reduce((sum, v) => sum + v, 0) / parts.length : -1;
  };

  const sorted = [...candidates].sort((a, b) => compositeOf(b) - compositeOf(a));
  return { ranked: sorted.map((c) => c.quote), ...rankingMetaFor(sorted[0], ["cost", "eta", "reliability"]) };
}

export async function routeQuote(
  providers: RoutableProvider[],
  request: QuoteRequest,
  preset: RankingPreset = "balanced",
): Promise<RoutingResult> {
  const attempts: RoutingAttempt[] = [];
  const candidates: RankableQuote[] = [];

  await Promise.all(
    providers.map(async (p) => {
      if (!p.adapter?.getQuote) {
        attempts.push({ providerSlug: p.slug, providerName: p.name, outcome: "skipped", detail: "No quote support for this provider yet." });
        return;
      }
      if (!p.credentials) {
        attempts.push({ providerSlug: p.slug, providerName: p.name, outcome: "skipped", detail: "Not connected." });
        return;
      }
      try {
        const quote = await p.adapter.getQuote(p.credentials, request);
        attempts.push({ providerSlug: p.slug, providerName: p.name, outcome: "quoted", detail: "Quote received.", quote });
        candidates.push({ quote, healthOkRatio: p.healthOkRatio ?? null });
      } catch (error) {
        attempts.push({
          providerSlug: p.slug,
          providerName: p.name,
          outcome: "failed",
          detail: error instanceof Error ? error.message : "Quote request failed.",
        });
      }
    }),
  );

  const { ranked, rankingConfidence, rankingInputsUsed, rankingInputsMissing } = rankQuotes(candidates, preset);

  return { preset, selected: ranked[0] ?? null, attempts, rankingConfidence, rankingInputsUsed, rankingInputsMissing };
}
