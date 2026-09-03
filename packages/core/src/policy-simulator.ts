/**
 * Policy Simulator — runs the same PaymentIntent against two PolicyVersions
 * and diffs the outcome. Pure and read-only: it reuses evaluatePolicy
 * exactly as the real Decision Engine does, but never persists a Decision
 * and never calls a quote adapter (a simulation must never touch real money
 * movement or spend a real quote API call) — quote-dependent rules
 * (requireLiveQuote, cost/eta ceilings that need a live quote) are evaluated
 * against whatever pre-quote data is available and report "unknown" exactly
 * as the real engine would before any quote existed.
 */
import type { PaymentIntent, PolicyRules, PolicySimulationCandidate, PolicySimulationResult } from "@railor/types";
import { loadConnectionStatuses } from "./connectivity.js";
import { loadProviderIdsWithActiveIncidents } from "./decision-repository.js";
import { evaluateProvider, scoreProvider, settlementMinutes } from "./eligibility.js";
import { evaluatePolicy, type PolicyCandidateInput } from "./policy.js";
import { loadProviderInputs } from "./repository.js";
import { intentToCorridorQuery } from "@railor/types";

export interface SimulatePolicyOptions {
  organizationId: string;
  now?: Date;
}

export async function simulatePolicy(
  intent: PaymentIntent,
  rulesA: PolicyRules,
  rulesB: PolicyRules,
  options: SimulatePolicyOptions,
): Promise<PolicySimulationResult> {
  const now = options.now ?? new Date();
  const query = intentToCorridorQuery(intent);

  const [allInputs, connectionStatuses] = await Promise.all([
    loadProviderInputs(),
    loadConnectionStatuses(options.organizationId),
  ]);
  const realInputs = allInputs.filter((p) => !p.isDemo);
  const incidentSet = await loadProviderIdsWithActiveIncidents(realInputs.map((p) => p.id));

  const candidates: PolicySimulationCandidate[] = [];
  let bestA: { slug: string; score: number } | null = null;
  let bestB: { slug: string; score: number } | null = null;
  const allowedUnderA: string[] = [];
  const allowedUnderB: string[] = [];
  const blockedUnderA: string[] = [];
  const blockedUnderB: string[] = [];
  const rulesResponsible = new Set<string>();

  for (const provider of realInputs) {
    const evaluation = evaluateProvider(provider, query, { now });
    if (evaluation.verdict !== "supported" && evaluation.verdict !== "additional_requirements") continue;

    const candidateInput: PolicyCandidateInput = {
      providerId: provider.id,
      providerSlug: provider.slug,
      providerCategory: provider.category,
      routeConfirmation: evaluation.routeConfirmation,
      lastVerifiedAt: evaluation.lastVerifiedAt,
      connected: connectionStatuses.get(provider.id) === "connected",
      quote: null,
      advertisedFeeCostBps: provider.feeCostBps ?? null,
      advertisedSettlementMinutes: settlementMinutes(provider.advertisedSettlement),
      healthOkRatio: provider.healthOkRatio,
      hasActiveIncident: incidentSet.has(provider.id),
    };

    const evalA = evaluatePolicy(intent, rulesA, candidateInput, now);
    const evalB = evaluatePolicy(intent, rulesB, candidateInput, now);
    const changed = evalA.result !== evalB.result;
    if (changed) {
      for (const r of [...evalA.ruleResults, ...evalB.ruleResults]) rulesResponsible.add(r.rule);
    }

    if (evalA.result === "pass") allowedUnderA.push(provider.slug);
    else blockedUnderA.push(provider.slug);
    if (evalB.result === "pass") allowedUnderB.push(provider.slug);
    else blockedUnderB.push(provider.slug);

    if (evalA.result === "pass" || evalB.result === "pass") {
      const { score } = scoreProvider(provider, evaluation, intent.preference);
      if (evalA.result === "pass" && (!bestA || score > bestA.score)) bestA = { slug: provider.slug, score };
      if (evalB.result === "pass" && (!bestB || score > bestB.score)) bestB = { slug: provider.slug, score };
    }

    candidates.push({
      providerSlug: provider.slug,
      providerName: provider.name,
      resultA: evalA.result,
      resultB: evalB.result,
      changed,
      reasonCodesA: evalA.ruleResults.filter((r) => r.code).map((r) => r.code!),
      reasonCodesB: evalB.ruleResults.filter((r) => r.code).map((r) => r.code!),
    });
  }

  return {
    allowedUnderA,
    allowedUnderB,
    blockedUnderA,
    blockedUnderB,
    recommendedProviderA: bestA?.slug ?? null,
    recommendedProviderB: bestB?.slug ?? null,
    recommendationChanged: (bestA?.slug ?? null) !== (bestB?.slug ?? null),
    candidates,
    rulesResponsibleForChanges: [...rulesResponsible],
  };
}
