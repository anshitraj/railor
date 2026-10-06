/** Read-only presentation of the existing decision evaluation. No second routing engine. */
import type { PaymentIntent } from "@railor/types";
import { getAdapter } from "./adapters.js";
import { runDecisionEngine, type DecisionEngineOptions, type DecisionEnginePolicyContext } from "./decision-engine.js";
import type { DecisionCandidateInsert, DecisionInsert } from "./decision-repository.js";

export type SearchQuoteState = "LIVE_CONNECTED" | "INDICATIVE" | "CONNECT_TO_QUOTE" | "QUOTE_UNAVAILABLE" | "ROUTE_UNAVAILABLE" | "UNKNOWN";

export function normalizeSearchCandidate(candidate: DecisionCandidateInsert) {
  const dependency = candidate.dependencySnapshot ?? {};
  const connected = dependency.connected === true;
  const routeUnavailable = candidate.routeCertainty === "unsupported" || candidate.eligibilityStatus === "unavailable";
  const plausible = candidate.routeCertainty === "confirmed" || candidate.routeCertainty === "partially_confirmed";
  const quote = candidate.quoteSnapshot;
  let quoteState: SearchQuoteState;
  if (routeUnavailable) quoteState = "ROUTE_UNAVAILABLE";
  else if (quote?.quoteType === "live" && connected && quote.accountContext === "customer_connected") quoteState = "LIVE_CONNECTED";
  else if (quote?.quoteType === "indicative") quoteState = "INDICATIVE";
  else if (plausible && !connected && dependency.quoteCapable === true) quoteState = "CONNECT_TO_QUOTE";
  else if (plausible) quoteState = "QUOTE_UNAVAILABLE";
  else quoteState = "UNKNOWN";

  const policyReasons = candidate.policyEvaluation.ruleResults.filter((r) => r.result !== "pass");
  const missingInformation = [
    ...policyReasons.filter((r) => r.result === "unknown").map((r) => r.message),
    ...(quoteState === "UNKNOWN" ? ["Route or entity evidence is not sufficient to confirm availability."] : []),
    ...(quoteState === "CONNECT_TO_QUOTE" ? ["Connect your provider account to request account-specific pricing."] : []),
    ...(quoteState === "QUOTE_UNAVAILABLE" ? ["A current quote could not be obtained."] : []),
  ];
  return {
    provider: candidate.providerName,
    providerId: candidate.providerId,
    providerSlug: candidate.providerSlug,
    routeId: candidate.routeId,
    eligibilityStatus: candidate.eligibilityStatus,
    entityEligibility: candidate.entityEligibility,
    routeConfirmation: candidate.routeCertainty,
    policyPreview: candidate.policyEvaluation.result,
    policyReasonCodes: policyReasons.map((r) => r.code).filter(Boolean),
    policyReasons: policyReasons.map((r) => r.message),
    connectionState: connected ? "connected" : "not_connected",
    quoteState,
    quoteType: quote?.quoteType ?? "none",
    quoteAccountContext: quote?.accountContext ?? null,
    recipientAmount: quote?.recipientAmount ?? null,
    knownCost: quote?.feeAmount !== undefined ? { amount: quote.feeAmount, currency: quote.feeCurrency ?? null } : null,
    costCompleteness: candidate.costCompleteness,
    etaMinutes: quote?.estimatedArrivalMinutes ?? null,
    advertisedSettlement: typeof dependency.settlement === "string" ? dependency.settlement : null,
    reliabilityObserved: candidate.reliabilitySnapshot,
    activeIncident: dependency.activeIncident === true,
    evidenceFreshness: typeof dependency.lastVerifiedAt === "string" ? dependency.lastVerifiedAt : null,
    rankingScore: typeof dependency.rankingScore === "number" ? dependency.rankingScore : null,
    rankingMetric: typeof dependency.rankingMetric === "number" ? Math.abs(dependency.rankingMetric) : null,
    rankingPreference: typeof dependency.rankingPreference === "string" ? dependency.rankingPreference : null,
    rankingConfidence: typeof dependency.rankingConfidence === "number" ? dependency.rankingConfidence : null,
    rank: candidate.rank,
    selected: candidate.selected,
    unavailableReason: routeUnavailable ? "Evidence says this route is unsupported." : candidate.policyEvaluation.result === "fail" ? policyReasons.map((r) => r.message).join(" ") : null,
    missingInformation,
    evidenceIds: candidate.evidenceIds,
    evidence: Array.isArray(dependency.evidence) ? dependency.evidence.map((item) => {
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { id: typeof source.id === "string" ? source.id : null,
        sourceUrl: typeof source.sourceUrl === "string" && /^https?:\/\//i.test(source.sourceUrl) ? source.sourceUrl : null,
        title: typeof source.sourceTitle === "string" ? source.sourceTitle : null,
        lastVerifiedAt: source.lastVerifiedAt instanceof Date ? source.lastVerifiedAt.toISOString() : typeof source.lastVerifiedAt === "string" ? source.lastVerifiedAt : null };
    }) : [],
    quoteObservedAt: quote?.observedAt ?? null,
    quoteExpiresAt: quote?.expiresAt ?? null,
    canRequestConnection: !connected,
    supportsCredentialConnection: Boolean(getAdapter(candidate.providerSlug)) && candidate.providerSlug !== "coinbase",
  };
}

export function projectSearchPreview(intent: PaymentIntent, evaluation: DecisionInsert) {
  const explanation = evaluation.explain as { whyAlternativesLost?: Array<{ providerSlug: string; reasons: string[] }> };
  const candidates = evaluation.candidates.map((candidate) => {
    const normalized = normalizeSearchCandidate(candidate);
    return { ...normalized, comparisonReason: candidate.selected
      ? `Passed policy and ranked first for ${intent.preference.replaceAll("_", " ")}.`
      : explanation.whyAlternativesLost?.find((alternative) => alternative.providerSlug === candidate.providerSlug)?.reasons[0]
        ?? normalized.unavailableReason ?? normalized.missingInformation[0] ?? null };
  });
  const permitted = candidates.filter((c) => c.policyPreview === "pass" &&
    (c.routeConfirmation === "confirmed" || c.routeConfirmation === "partially_confirmed"));
  const rejected = candidates.filter((c) => c.policyPreview === "fail" || c.quoteState === "ROUTE_UNAVAILABLE");
  // A generic balanced ranking can be useful with partial inputs. For a specific
  // numeric preference, do not claim a winner without its actual comparable metric.
  const selected = permitted.find((c) => c.selected) ?? null;
  const metricPresent = selected && ((["balanced", "easiest_onboarding", "widest_coverage"].includes(intent.preference) && (selected.rankingConfidence ?? 0) > 0)
    || (intent.preference === "cheapest" && selected.costCompleteness === "complete" && selected.knownCost !== null)
    || (intent.preference === "fastest" && (selected.etaMinutes !== null || selected.advertisedSettlement !== null))
    || (intent.preference === "most_reliable" && selected.reliabilityObserved !== null)
    || (intent.preference === "max_recipient_amount" && selected.recipientAmount !== null));
  const best = metricPresent ? selected : null;
  const explain = evaluation.explain as { missingInformation?: string[]; whatWouldChange?: string[] };
  return {
    object: "search_preview" as const,
    intent,
    policyId: evaluation.policyId,
    policyVersionId: evaluation.policyVersionId,
    evaluatedAt: new Date().toISOString(),
    candidates,
    permittedCandidates: permitted,
    rejectedCandidates: rejected,
    bestCandidate: best,
    rankingConfidence: best?.rankingConfidence ?? 0,
    recommendationQualified: Boolean(best),
    missingInformation: [...new Set([...(explain.missingInformation ?? []), ...candidates.flatMap((c) => c.missingInformation)])],
    whatWouldChange: explain.whatWouldChange ?? [],
    evidenceSummary: { providersChecked: candidates.length, withEvidence: candidates.filter((c) => c.evidenceIds.length > 0).length, withCurrentQuote: candidates.filter((c) => c.quoteState === "LIVE_CONNECTED" || c.quoteState === "INDICATIVE").length },
    warnings: evaluation.warnings,
    executionState: "NOT_INITIATED" as const,
  };
}

export async function searchPreview(intent: PaymentIntent, policy: DecisionEnginePolicyContext, options: DecisionEngineOptions) {
  const evaluation = await runDecisionEngine(intent, policy, { ...options, mode: "optimize", proposedExecutor: undefined });
  return projectSearchPreview(intent, evaluation);
}

export type SearchPreviewResult = Awaited<ReturnType<typeof searchPreview>>;
export type SearchPreviewCandidate = SearchPreviewResult["candidates"][number];
