/**
 * The deterministic Decision Engine.
 *
 * PaymentIntent -> existing eligibility engine -> candidates -> Policy
 * Evaluator -> remove hard policy failures -> live quotes where genuinely
 * available -> health/reliability -> existing deterministic ranking ->
 * Decision. Every stage reuses existing, unmodified code
 * (evaluateProvider/scoreProvider from eligibility.ts, loadProviderInputs
 * from repository.ts, loadConnectionStatuses from connectivity.ts) - this
 * file only orchestrates and adds the policy/decision layer on top.
 *
 * Credential decryption never happens here. `fetchQuote` is injected by the
 * caller (the /v1/decisions route, which has apps/web/lib's
 * getConnectionCredentials) - this file only ever sees a UnifiedQuote or
 * null, exactly like routing.ts's routeQuote never sees how credentials were
 * obtained. This keeps the engine testable with a fake fetchQuote and keeps
 * "server-only" credential code out of the shared package.
 */
import { createHash } from "node:crypto";
import type {
  CandidatePolicyEvaluation,
  ConnectionState,
  CostCompleteness,
  DecisionEventKind,
  DecisionExplain,
  DecisionStatus,
  PaymentIntent,
  PolicyReasonCode,
  PolicyRules,
  QuoteSnapshot,
  QuoteState,
  RouteConfirmation,
} from "@railor/types";
import { intentToCorridorQuery } from "@railor/types";
import { loadConnectionStatuses } from "./connectivity.js";
import { loadProviderIdsWithActiveIncidents, type DecisionCandidateInsert, type DecisionInsert } from "./decision-repository.js";
import { evaluateProvider, isDecisionEligible, scoreProvider, settlementMinutes, type Evaluation, type ProviderInput } from "./eligibility.js";
import { directProviderBonus, evaluatePolicy, type PolicyCandidateInput } from "./policy.js";
import { loadProviderInputs } from "./repository.js";
import { getAdapter } from "./adapters.js";
import type { QuoteRequest, UnifiedQuote } from "./unified.js";

export const DECISION_ENGINE_VERSION = "1.1.0";

export type QuoteFetcher = (
  providerSlug: string,
  providerId: string,
  request: QuoteRequest,
) => Promise<UnifiedQuote | null>;

export interface DecisionEnginePolicyContext {
  policyId: string;
  policyVersionId: string;
  policyVersionNumber: number;
  rules: PolicyRules;
}

export interface DecisionEngineOptions {
  organizationId: string;
  now?: Date;
  /** Injected because credential decryption lives outside @railor/core. Omit to skip live-quote fetching entirely (the engine still produces a full Decision from eligibility/policy/reliability data alone). */
  fetchQuote?: QuoteFetcher;
  /** Allowlisted backend reference-price integrations, not customer connections or execution authority. */
  referenceQuoteProviders?: string[];
  previousDecisionId?: string | null;
  mode?: "enforce" | "optimize";
  proposedExecutor?: { provider: string };
  createdBy?: string;
}

interface EnginedCandidate {
  provider: ProviderInput;
  evaluation: Evaluation;
  connected: boolean;
  hasQuoteAdapter: boolean;
  prePolicy: CandidatePolicyEvaluation;
  quote: UnifiedQuote | null;
  finalPolicy: CandidatePolicyEvaluation;
  score: number;
  rankingConfidence: number;
}

function toQuoteSnapshot(quote: UnifiedQuote): QuoteSnapshot {
  return {
    providerQuoteId: quote.providerQuoteId,
    amount: quote.amount,
    recipientAmount: quote.recipientAmount,
    feeAmount: quote.feeAmount,
    feeCurrency: quote.feeCurrency,
    costPartial: quote.costPartial,
    exchangeRate: quote.exchangeRate,
    estimatedArrivalMinutes: quote.estimatedArrivalMinutes,
    quoteType: quote.quoteType,
    accountContext: quote.accountContext,
    observedAt: quote.observedAt,
    expiresAt: quote.expiresAt,
  };
}

function costCompletenessOf(quote: UnifiedQuote | null): CostCompleteness {
  if (!quote || quote.feeAmount === undefined || !quote.feeCurrency) return "unknown";
  return quote.costPartial ? "partial" : "complete";
}

/**
 * scoreProvider() (eligibility.ts, unmodified) is the primary, deterministic
 * signal. A real, complete quote nudges that score toward the quote's actual
 * cost/eta rather than the pre-quote advertised proxy scoreProvider already
 * used — bounded to 30% of the final score so one quote can never fully
 * override the base engine, and only ever applied when the quote is
 * genuinely complete (a partial quote never "beats" a complete advertised
 * figure just because its number looks smaller — same discipline as
 * routing.ts's costTier). preferDirectProvider adds a small, fixed,
 * documented bonus — a ranking nudge, never a hard gate.
 */
function finalScore(base: number, quote: UnifiedQuote | null, rules: PolicyRules, category: string): number {
  let score = base;
  if (quote?.quoteType === "live" && quote.accountContext === "customer_connected" && !quote.costPartial && quote.feeAmount !== undefined && quote.amount > 0) {
    const bps = (quote.feeAmount / quote.amount) * 10_000;
    const quoteComponent = Math.max(0, Math.min(100, 100 - bps / 2));
    score = base * 0.7 + quoteComponent * 0.3;
  }
  score += directProviderBonus(rules, category) * 2;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/** A specific preference needs its own observed/published metric; provider fee and
 * onboarding proxies must never masquerade as a payout, total cost or uptime. */
function preferenceMetric(candidate: EnginedCandidate, preference: PaymentIntent["preference"]): number | null {
  switch (preference) {
    case "cheapest": return candidate.quote && candidate.quote.quoteType === "live" && candidate.quote.accountContext === "customer_connected" && !candidate.quote.costPartial
      && candidate.quote.feeAmount !== undefined ? -candidate.quote.feeAmount : null;
    case "fastest": {
      const minutes = candidate.quote?.estimatedArrivalMinutes ?? settlementMinutes(candidate.provider.advertisedSettlement);
      return minutes === null || minutes === undefined ? null : -minutes;
    }
    case "most_reliable": return candidate.provider.healthOkRatio;
    case "max_recipient_amount": return candidate.quote && candidate.quote.quoteType === "live" && candidate.quote.accountContext === "customer_connected"
      ? candidate.quote.recipientAmount ?? null : null;
    default: return candidate.score;
  }
}

/** Ordinal used only to pick the single "best" RouteConfirmation among rejected candidates for the top-level Decision.certainty fallback - never used to upgrade any individual candidate's own value. */
const CERTAINTY_RANK: Record<RouteConfirmation, number> = {
  confirmed: 4,
  partially_confirmed: 3,
  unconfirmed: 2,
  unknown: 1,
  unsupported: 0,
};

export async function runDecisionEngine(
  intent: PaymentIntent,
  policy: DecisionEnginePolicyContext,
  options: DecisionEngineOptions,
): Promise<DecisionInsert> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? (options.proposedExecutor ? "enforce" : "optimize");
  if (mode === "enforce" && !options.proposedExecutor?.provider) throw new Error("proposed_executor_required");
  if (mode === "optimize" && options.proposedExecutor) throw new Error("executor_requires_enforce_mode");
  const query = intentToCorridorQuery(intent);

  const [allInputs, connectionStatuses] = await Promise.all([
    loadProviderInputs(),
    loadConnectionStatuses(options.organizationId),
  ]);
  // A Decision must never recommend one of Railor's own fabricated demo
  // companies - same rule searchCorridors already enforces by default.
  const realInputs = allInputs.filter((p) => !p.isDemo &&
    (mode !== "enforce" || p.slug === options.proposedExecutor!.provider));
  if (mode === "enforce" && !realInputs.length) throw new Error("provider_not_found");

  const incidentSet = await loadProviderIdsWithActiveIncidents(realInputs.map((p) => p.id));

  const enginedByProvider: EnginedCandidate[] = realInputs.map((provider) => {
    const evaluation = evaluateProvider(provider, query, { now });
    const connected = connectionStatuses.get(provider.id) === "connected";
    const adapter = getAdapter(provider.slug);
    const settlementMin = settlementMinutes(provider.advertisedSettlement);

    const candidateInput: PolicyCandidateInput = {
      providerId: provider.id,
      providerSlug: provider.slug,
      providerCategory: provider.category,
      routeConfirmation: evaluation.routeConfirmation,
      entityEligibility: evaluation.entityEligibility,
      lastVerifiedAt: evaluation.lastVerifiedAt,
      connected,
      quote: null,
      advertisedFeeCostBps: provider.feeCostBps ?? null,
      advertisedSettlementMinutes: settlementMin,
      healthOkRatio: provider.healthOkRatio,
      hasActiveIncident: incidentSet.has(provider.id),
    };

    return {
      provider,
      evaluation,
      connected,
      hasQuoteAdapter: Boolean(adapter?.getQuote),
      prePolicy: evaluatePolicy(intent, policy.rules, candidateInput, now),
      quote: null,
      finalPolicy: evaluatePolicy(intent, policy.rules, candidateInput, now),
      score: 0,
      rankingConfidence: 0,
    };
  });

  // Only fetch a live quote for a candidate that (a) has a plausible base
  // route, (b) didn't already hard-fail policy on pre-quote facts, and (c)
  // is connected with quote support, or Wise has a public fiat indicative
  // endpoint. Public pricing is never treated as a customer live quote.
  const quoteWorthy = enginedByProvider.filter(
    (c) => isDecisionEligible(c.evaluation) && !c.prePolicy.ruleResults.some((r) =>
      r.result === "fail" && !["requireLiveQuote", "maximumKnownCostBps", "maximumEtaMinutes"].includes(r.rule)) &&
      (c.connected || (Boolean(intent.sourceCurrency) && (c.provider.slug === "wise" || options.referenceQuoteProviders?.includes(c.provider.slug)))) && c.hasQuoteAdapter,
  );

  const warnings: string[] = [];
  if (options.fetchQuote && quoteWorthy.length) {
    const request: QuoteRequest = {
      intentFingerprint: createHash("sha256").update(JSON.stringify(sortKeysDeep(intent))).digest("hex"),
      sourceAsset: intent.sourceAsset ?? intent.sourceCurrency ?? "",
      sourceNetwork: intent.sourceNetwork,
      destinationCurrency: intent.destinationCurrency ?? "",
      destinationCountry: intent.destinationCountry,
      amount: intent.amount,
      entityCountry: intent.sourceEntityCountry,
      paymentMethodType: intent.namedRail,
    };
    await Promise.all(
      quoteWorthy.map(async (c) => {
        try {
          const quote = await options.fetchQuote!(c.provider.slug, c.provider.id, request);
          if (quote) {
            const observed = Date.parse(quote.observedAt);
            const expires = quote.expiresAt ? Date.parse(quote.expiresAt) : null;
            if (quote.providerSlug !== c.provider.slug || quote.amount !== intent.amount ||
              quote.sourceAsset !== request.sourceAsset || quote.destinationCurrency !== request.destinationCurrency ||
              (quote.sourceNetwork ?? null) !== (request.sourceNetwork ?? null) ||
              (quote.destinationCountry && quote.destinationCountry !== request.destinationCountry) ||
              !Number.isFinite(observed) || observed > now.getTime() + 60_000 ||
              (expires !== null && (!Number.isFinite(expires) || expires <= now.getTime())) ||
              [quote.feeAmount, quote.recipientAmount].some((v) => v !== undefined && (!Number.isFinite(v) || v < 0))) {
              throw new Error("quote_scope_or_expiry_invalid");
            }
            // Costs denominated in a different currency cannot be divided by
            // the source amount and presented as a comparable percentage.
            c.quote = { ...quote, costPartial: quote.costPartial || (quote.feeAmount !== undefined && quote.feeCurrency !== request.sourceAsset) };
          }
        } catch (error) {
          warnings.push(`Quote request to ${c.provider.slug} failed or returned an invalid scope/expiry. Re-quote before relying on its price.`);
          c.quote = null;
        }
      }),
    );
  } else if (!options.fetchQuote && quoteWorthy.length) {
    warnings.push(`${quoteWorthy.length} connected, quote-capable candidate(s) were not quoted - no quote fetcher was supplied for this run.`);
  }

  // Re-run policy with real quote data now available - requireLiveQuote and
  // the cost/eta ceilings can only be judged honestly after this point.
  for (const c of enginedByProvider) {
    const candidateInput: PolicyCandidateInput = {
      providerId: c.provider.id,
      providerSlug: c.provider.slug,
      providerCategory: c.provider.category,
      routeConfirmation: c.evaluation.routeConfirmation,
      entityEligibility: c.evaluation.entityEligibility,
      lastVerifiedAt: c.evaluation.lastVerifiedAt,
      connected: c.connected,
      quote: c.quote,
      advertisedFeeCostBps: c.provider.feeCostBps ?? null,
      advertisedSettlementMinutes: settlementMinutes(c.provider.advertisedSettlement),
      healthOkRatio: c.provider.healthOkRatio,
      hasActiveIncident: incidentSet.has(c.provider.id),
    };
    c.finalPolicy = evaluatePolicy(intent, policy.rules, candidateInput, now);
    const { score, rankingConfidence } = scoreProvider(c.provider, c.evaluation, intent.preference);
    c.score = finalScore(score, c.quote, policy.rules, c.provider.category);
    c.rankingConfidence = rankingConfidence;
  }

  // Eligible = has a plausible base route at all, per isDecisionEligible
  // (which also admits a confirmed/partially-confirmed transport route whose
  // shared verdict merely reads "unknown" for lack of entity-jurisdiction
  // evidence - that missing evidence is then either fatal or not per
  // requireConfirmedEntityEligibility, decided by policy below, not here).
  // Everyone else (unavailable base eligibility) is reported for
  // auditability but was never in the running for a recommendation
  // regardless of policy.
  const eligible = enginedByProvider.filter((c) => isDecisionEligible(c.evaluation) &&
    (mode !== "enforce" || c.evaluation.routeConfirmation === "confirmed"));
  const policyPassers = eligible.filter((c) => c.finalPolicy.result === "pass");
  const policyUnknowns = eligible.filter((c) => c.finalPolicy.result === "unknown");

  const rankingPreference = mode === "enforce" ? "balanced" : intent.preference;
  const ranked = policyPassers.filter((c) => preferenceMetric(c, rankingPreference) !== null)
    .sort((a, b) => (preferenceMetric(b, rankingPreference)! - preferenceMetric(a, rankingPreference)!) || b.score - a.score || a.provider.slug.localeCompare(b.provider.slug));
  const winner = ranked[0] ?? null;

  let status: DecisionStatus;
  if (eligible.length === 0) {
    status = "no_verified_route";
  } else if (winner && policy.rules.humanApprovalAboveAmount !== undefined && intent.amount > policy.rules.humanApprovalAboveAmount) {
    status = "approval_required";
  } else if (winner) {
    status = "allow";
  } else if (policyUnknowns.length > 0 || policyPassers.length > 0) {
    status = "insufficient_data";
  } else {
    status = "deny";
  }
  // ENFORCE is a permission check. Unknown evidence fails closed with the
  // detailed explanation retained; it never grants a different executor.
  if (mode === "enforce" && (status === "no_verified_route" || status === "insufficient_data")) status = "deny";

  const quoteState: QuoteState = !winner?.quote ? "none" : winner.quote.quoteType;
  const connectionState: ConnectionState = winner
    ? winner.connected
      ? "connected"
      : "not_connected"
    : eligible.length === 0
      ? "unknown"
      : eligible.every((c) => c.connected)
        ? "connected"
        : eligible.every((c) => !c.connected)
          ? "not_connected"
          : "mixed";

  const validUntil = winner?.quote?.expiresAt ? new Date(winner.quote.expiresAt) : null;
  if (status === "approval_required" && policy.rules.humanApprovalAboveAmount !== undefined) {
    warnings.push(`Amount ${intent.amount} exceeds this policy's human-approval threshold of ${policy.rules.humanApprovalAboveAmount}.`);
  }

  const candidates: DecisionCandidateInsert[] = enginedByProvider.map((c) => {
    const rank = policyPassers.includes(c) ? ranked.indexOf(c) + 1 : null;
    const rejectionReasonCodes: PolicyReasonCode[] = c === winner
      ? []
      : c.finalPolicy.ruleResults.filter((r) => r.result === "fail" || r.result === "unknown").map((r) => r.code).filter((x): x is PolicyReasonCode => Boolean(x));
    return {
      providerId: c.provider.id,
      providerSlug: c.provider.slug,
      providerName: c.provider.name,
      routeId: c.evaluation.dependedOnRouteId,
      eligibilityStatus: c.evaluation.verdict,
      routeCertainty: c.evaluation.routeConfirmation,
      entityEligibility: c.evaluation.entityEligibility,
      policyEvaluation: c.finalPolicy,
      dependencySnapshot: {
        connected: c.connected, activeIncident: incidentSet.has(c.provider.id),
        quoteCapable: c.hasQuoteAdapter, rankingScore: c.score, rankingConfidence: c.rankingConfidence,
        rankingPreference, rankingMetric: preferenceMetric(c, rankingPreference),
        lastVerifiedAt: c.evaluation.lastVerifiedAt?.toISOString() ?? null,
        feeCostBps: c.provider.feeCostBps ?? null, settlement: c.provider.advertisedSettlement ?? null,
        evidence: [...c.evaluation.evidence].sort((a, b) => (a.id ?? a.sourceUrl).localeCompare(b.id ?? b.sourceUrl)),
        confirmedDimensions: [...c.evaluation.confirmedDimensions].sort(),
        unconfirmedDimensions: [...c.evaluation.unconfirmedDimensions].sort(),
      },
      quoteSnapshot: c.quote ? toQuoteSnapshot(c.quote) : null,
      costCompleteness: costCompletenessOf(c.quote),
      reliabilitySnapshot: c.provider.healthOkRatio,
      rank,
      selected: c === winner,
      rejectionReasonCodes,
      evidenceIds: c.evaluation.evidence.map((e) => e.id).filter((id): id is string => Boolean(id)),
    };
  });

  const explain = buildExplain(enginedByProvider, winner, eligible, rankingPreference);

  const bestFallbackCertainty = eligible.length
    ? eligible.reduce<RouteConfirmation | null>((best, c) => {
        if (!c.evaluation.routeConfirmation) return best;
        if (!best) return c.evaluation.routeConfirmation;
        return CERTAINTY_RANK[c.evaluation.routeConfirmation] > CERTAINTY_RANK[best] ? c.evaluation.routeConfirmation : best;
      }, null)
    : null;

  const decisionInputForHash: DecisionInsert = {
    organizationId: options.organizationId,
    mode,
    proposedExecutor: options.proposedExecutor?.provider ?? null,
    createdBy: options.createdBy ?? null,
    intentSnapshot: intent as unknown as Record<string, unknown>,
    policyId: policy.policyId,
    policyVersionId: policy.policyVersionId,
    policyVersionNumber: policy.policyVersionNumber,
    engineVersion: DECISION_ENGINE_VERSION,
    status,
    recommendedProviderId: winner?.provider.id ?? null,
    recommendedProviderSlug: winner?.provider.slug ?? null,
    recommendedRouteId: winner?.evaluation.dependedOnRouteId ?? null,
    certainty: winner?.evaluation.routeConfirmation ?? bestFallbackCertainty,
    rankingConfidence: winner?.rankingConfidence ?? 0,
    quoteState,
    connectionState,
    validUntil,
    revalidationRequired: false,
    decisionHash: "",
    warnings,
    explain: explain as unknown as Record<string, unknown>,
    previousDecisionId: options.previousDecisionId ?? null,
    candidates,
  };

  decisionInputForHash.decisionHash = hashDecisionInputs(decisionInputForHash);
  return decisionInputForHash;
}

function buildExplain(
  all: EnginedCandidate[],
  winner: EnginedCandidate | null,
  eligible: EnginedCandidate[],
  preference: PaymentIntent["preference"],
): DecisionExplain {
  const whySelected: string[] = [];
  if (winner) {
    whySelected.push(`${winner.provider.name} passed every configured policy rule.`);
    whySelected.push(`Route certainty: ${winner.evaluation.routeConfirmation ?? "not applicable"}.`);
    if (winner.evaluation.entityEligibility) whySelected.push(`Entity eligibility: ${winner.evaluation.entityEligibility}.`);
    const metric = preferenceMetric(winner, preference);
    whySelected.push(preference === "balanced" || preference === "easiest_onboarding" || preference === "widest_coverage"
      ? `Ranking score ${winner.score}/100 (${Math.round(winner.rankingConfidence * 100)}% of ranking inputs were real data).`
      : `Selected by ${preference.replaceAll("_", " ")} using the available comparable metric ${metric === null ? "(missing)" : Math.abs(metric)}; candidates without that metric were not ranked.`);
    if (winner.quote) whySelected.push(`Backed by a ${winner.quote.quoteType} quote observed at ${winner.quote.observedAt}.`);
  }

  const whyAlternativesLost = eligible
    .filter((c) => c !== winner)
    .map((c) => ({
      providerSlug: c.provider.slug,
      providerName: c.provider.name,
      reasons:
        c.finalPolicy.result === "fail" || c.finalPolicy.result === "unknown"
          ? c.finalPolicy.ruleResults.filter((r) => r.result !== "pass").map((r) => r.message)
          : preferenceMetric(c, preference) === null
            ? [`Not ranked for ${preference.replaceAll("_", " ")}: comparable metric missing.`]
            : [`Ranked lower for ${preference.replaceAll("_", " ")} (metric ${Math.abs(preferenceMetric(c, preference)!)} vs. ${winner ? Math.abs(preferenceMetric(winner, preference)!) : "n/a"}).`],
    }));

  const whatWouldChange: string[] = [];
  const missingInformation: string[] = [];
  for (const c of all) {
    for (const reason of c.evaluation.reasons) {
      if (reason.code === "no_data") missingInformation.push(`${c.provider.name}: ${reason.message}`);
    }
    for (const r of c.finalPolicy.ruleResults) {
      if (r.result === "unknown") missingInformation.push(`${c.provider.name}: ${r.message}`);
      if (r.result === "fail" && r.code === "provider_not_connected") whatWouldChange.push(`Connect ${c.provider.slug} to make it eligible for this decision.`);
      if (r.result === "fail" && r.code === "live_quote_required") whatWouldChange.push(`A live quote from ${c.provider.slug} would let it be evaluated.`);
    }
  }

  return {
    whySelected,
    whyAlternativesLost,
    whatWouldChange: [...new Set(whatWouldChange)],
    missingInformation: [...new Set(missingInformation)].slice(0, 20),
  };
}

/**
 * Canonical, deterministic hash over exactly the inputs that determine a
 * Decision's outcome: the intent, the policy version, every candidate's
 * eligibility/route/policy/quote facts and the evidence ids they depended
 * on, the engine version, and the final result. Same inputs at the same
 * policy version and engine version always produce the same hash - this is
 * what "replay" means for a Decision. No credentials or secrets are ever
 * part of this input (quotes/evidence/policy are never secret data).
 * Deterministic regardless of object key order or array order: everything
 * is explicitly sorted before hashing.
 */
export function hashDecisionInputs(input: Omit<DecisionInsert, "decisionHash">): string {
  const canonicalCandidates = [...input.candidates]
    .map((c) => ({
      providerId: c.providerId,
      routeId: c.routeId,
      eligibilityStatus: c.eligibilityStatus,
      routeCertainty: c.routeCertainty,
      policyResult: c.policyEvaluation.result,
      policyReasonCodes: [...c.policyEvaluation.ruleResults.map((r) => r.code).filter(Boolean)].sort(),
      quoteProviderQuoteId: c.quoteSnapshot?.providerQuoteId ?? null,
      quoteObservedAt: c.quoteSnapshot?.observedAt ?? null,
      evidenceIds: [...c.evidenceIds].sort(),
      selected: c.selected,
    }))
    .sort((a, b) => a.providerId.localeCompare(b.providerId));

  const canonical = {
    organizationId: input.organizationId,
    mode: input.mode ?? "optimize",
    proposedExecutor: input.proposedExecutor ?? null,
    intent: sortKeysDeep(input.intentSnapshot),
    policyVersionId: input.policyVersionId,
    engineVersion: input.engineVersion,
    status: input.status,
    recommendedProviderId: input.recommendedProviderId,
    candidates: canonicalCandidates,
    evaluations: [...input.candidates].sort((a, b) => a.providerId.localeCompare(b.providerId)).map((c) => ({
      providerId: c.providerId, entityEligibility: c.entityEligibility,
      rules: sortKeysDeep(c.policyEvaluation), quote: sortKeysDeep(c.quoteSnapshot),
      dependencies: sortKeysDeep(c.dependencySnapshot ?? {}),
      reliability: c.reliabilitySnapshot, costCompleteness: c.costCompleteness,
    })),
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

export const DECISION_EVENT_KIND_FOR_TRIGGER: Record<string, DecisionEventKind> = {
  quote_expired: "quote_expired",
  evidence_changed: "evidence_changed",
  provider_incident: "provider_incident",
  policy_changed: "policy_changed",
  route_changed: "route_changed",
  connection_state_changed: "connection_state_changed",
  manual: "revalidation_requested",
};
