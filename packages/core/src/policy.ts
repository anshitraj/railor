/**
 * The deterministic Policy Evaluator.
 *
 * Same discipline as eligibility.ts: pure function, no I/O, no LLM, no
 * randomness. Given a PaymentIntent, one PolicyVersion's rules, and one
 * candidate's already-computed facts (eligibility verdict, RouteConfirmation,
 * connection/quote/reliability/incident state — all produced elsewhere by
 * code that already exists), it returns PASS/FAIL/UNKNOWN/NOT_APPLICABLE per
 * rule plus a coded reason. It never re-derives eligibility or route
 * certainty itself — those come from evaluateProvider (eligibility.ts) and
 * are trusted verbatim, exactly the RouteConfirmation tiers already
 * documented in @railor/types. A hard rule failure can never be outvoted by
 * passing rules, and an UNKNOWN never silently reads as PASS when a rule
 * actually requires evidence Railor doesn't have.
 */
import type {
  CandidatePolicyEvaluation,
  PaymentIntent,
  PolicyEvalResult,
  PolicyReasonCode,
  PolicyRuleEvaluation,
  PolicyRules,
  RouteConfirmation,
} from "@railor/types";
import type { UnifiedQuote } from "./unified.js";

/** Everything the evaluator needs about one candidate. Built by decision-engine.ts from data the existing engine/repository already produce - nothing here is computed fresh by this file. */
export interface PolicyCandidateInput {
  providerId: string;
  providerSlug: string;
  /** Free-text providers.category - the only real signal available for the aggregator rules; see PolicyRules.allowAggregators in @railor/types for why this is best-effort, not a controlled taxonomy. */
  providerCategory: string;
  routeConfirmation: RouteConfirmation | null;
  /** Oldest evidence date this candidate's eligibility depended on - Evaluation.lastVerifiedAt from eligibility.ts, not recomputed here. */
  lastVerifiedAt: Date | null;
  connected: boolean;
  quote: UnifiedQuote | null;
  /** Pre-quote advertised fee, from ProviderInput.feeCostBps - a real published rate, distinct from (and superseded by) a complete live quote. */
  advertisedFeeCostBps: number | null;
  advertisedSettlementMinutes: number | null;
  /** null means zero real observations - never defaulted to perfect, same convention as ProviderInput.healthOkRatio. */
  healthOkRatio: number | null;
  hasActiveIncident: boolean;
}

/** confirmed > partially_confirmed > unconfirmed > unknown > unsupported - an explicit "no" ranks below simply not knowing, since it is a stronger, worse signal than absence of evidence. */
const CERTAINTY_ORDER: Record<RouteConfirmation, number> = {
  confirmed: 3,
  partially_confirmed: 2,
  unconfirmed: 1,
  unknown: 0,
  unsupported: -1,
};

function rule(
  ruleName: string,
  result: PolicyEvalResult,
  message: string,
  code?: PolicyReasonCode,
): PolicyRuleEvaluation {
  return { rule: ruleName, result, code, message };
}

/**
 * A fee is only trustworthy once it is either a published rate card figure
 * or a live quote whose response broke out every fee component
 * (`costPartial: false`) - a partial quote is never allowed to prove
 * compliance with a cost ceiling, because a partial number can only
 * understate the true cost. Mirrors routing.ts's costTier discipline.
 */
function knownCostBps(candidate: PolicyCandidateInput): number | null {
  if (candidate.quote && !candidate.quote.costPartial && candidate.quote.feeAmount !== undefined) {
    return (candidate.quote.feeAmount / candidate.quote.amount) * 10_000;
  }
  return candidate.advertisedFeeCostBps;
}

function knownEtaMinutes(candidate: PolicyCandidateInput): number | null {
  if (candidate.quote?.estimatedArrivalMinutes !== undefined) return candidate.quote.estimatedArrivalMinutes;
  return candidate.advertisedSettlementMinutes;
}

/** Evaluates every configured rule against one candidate. Unconfigured rules (default value, empty list) are skipped entirely rather than padded with noise. */
export function evaluatePolicy(
  intent: PaymentIntent,
  rules: PolicyRules,
  candidate: PolicyCandidateInput,
  now: Date = new Date(),
): CandidatePolicyEvaluation {
  const results: PolicyRuleEvaluation[] = [];

  if (rules.providerDenylist.length && rules.providerDenylist.includes(candidate.providerSlug)) {
    results.push(rule("providerDenylist", "fail", `${candidate.providerSlug} is on this policy's provider denylist.`, "provider_denied"));
  }
  if (rules.providerAllowlist?.length && !rules.providerAllowlist.includes(candidate.providerSlug)) {
    results.push(rule("providerAllowlist", "fail", `${candidate.providerSlug} is not on this policy's provider allowlist.`, "provider_not_allowed"));
  }

  if (intent.sourceAsset) {
    if (rules.deniedAssets.length && rules.deniedAssets.includes(intent.sourceAsset)) {
      results.push(rule("deniedAssets", "fail", `${intent.sourceAsset} is on this policy's denied-assets list.`, "asset_denied"));
    }
    if (rules.allowedAssets?.length && !rules.allowedAssets.includes(intent.sourceAsset)) {
      results.push(rule("allowedAssets", "fail", `${intent.sourceAsset} is not on this policy's allowed-assets list.`, "asset_denied"));
    }
  }

  if (intent.sourceNetwork) {
    if (rules.deniedNetworks.length && rules.deniedNetworks.includes(intent.sourceNetwork)) {
      results.push(rule("deniedNetworks", "fail", `${intent.sourceNetwork} is on this policy's denied-networks list.`, "network_denied"));
    }
    if (rules.allowedNetworks?.length && !rules.allowedNetworks.includes(intent.sourceNetwork)) {
      results.push(rule("allowedNetworks", "fail", `${intent.sourceNetwork} is not on this policy's allowed-networks list.`, "network_denied"));
    }
  }

  if (rules.minimumRouteCertainty) {
    if (!candidate.routeConfirmation) {
      // The query never asked for a full route, so RouteConfirmation was
      // never computed at all - the rule cannot be evaluated, not "passed".
      results.push(rule("minimumRouteCertainty", "unknown", "This intent did not resolve to a full-route query, so route certainty was never computed.", "route_certainty_too_low"));
    } else {
      const have = CERTAINTY_ORDER[candidate.routeConfirmation];
      const need = CERTAINTY_ORDER[rules.minimumRouteCertainty];
      if (have < need) {
        results.push(
          rule(
            "minimumRouteCertainty",
            "fail",
            `Route certainty is "${candidate.routeConfirmation}", below the policy's required "${rules.minimumRouteCertainty}".`,
            "route_certainty_too_low",
          ),
        );
      }
    }
  }

  if (rules.requireExactRouteEvidence && candidate.routeConfirmation !== "confirmed") {
    results.push(
      rule(
        "requireExactRouteEvidence",
        "fail",
        `This policy requires atomic, single-source route evidence ("confirmed"); this candidate is "${candidate.routeConfirmation ?? "not applicable"}".`,
        "exact_route_required",
      ),
    );
  }

  if (rules.maximumEvidenceAgeHours !== undefined) {
    if (!candidate.lastVerifiedAt) {
      results.push(rule("maximumEvidenceAgeHours", "fail", "No evidence timestamp on record - freshness cannot be proven.", "evidence_too_old"));
    } else {
      const ageHours = (now.getTime() - candidate.lastVerifiedAt.getTime()) / 3_600_000;
      if (ageHours > rules.maximumEvidenceAgeHours) {
        results.push(
          rule(
            "maximumEvidenceAgeHours",
            "fail",
            `Evidence is ${Math.round(ageHours)}h old, exceeding the policy's ${rules.maximumEvidenceAgeHours}h limit.`,
            "evidence_too_old",
          ),
        );
      }
    }
  }

  if (rules.requireCustomerConnectedProvider && !candidate.connected) {
    results.push(rule("requireCustomerConnectedProvider", "fail", `${candidate.providerSlug} is not connected for this organization.`, "provider_not_connected"));
  }

  if (rules.requireLiveQuote) {
    if (!candidate.quote || candidate.quote.quoteType !== "live") {
      results.push(rule("requireLiveQuote", "fail", `No live quote is available for ${candidate.providerSlug}.`, "live_quote_required"));
    }
  }

  // allowPrefunding: Railor has no real schema field recording whether a
  // provider requires prefunding - see PolicyRules.allowPrefunding in
  // @railor/types. Always not_applicable until that data exists; never
  // fabricated as a pass or a fail.
  if (!rules.allowPrefunding) {
    results.push(rule("allowPrefunding", "not_applicable", "Railor has no evidenced data on whether this provider requires prefunding.", "prefunding_forbidden"));
  }

  if (rules.maximumKnownCostBps !== undefined) {
    const bps = knownCostBps(candidate);
    if (bps === null) {
      results.push(rule("maximumKnownCostBps", "unknown", `No complete cost figure (advertised or live-quoted) is on record for ${candidate.providerSlug}.`, "cost_limit_exceeded"));
    } else if (bps > rules.maximumKnownCostBps) {
      results.push(rule("maximumKnownCostBps", "fail", `Known cost is ${Math.round(bps)}bps, exceeding the policy's ${rules.maximumKnownCostBps}bps limit.`, "cost_limit_exceeded"));
    }
  }

  if (rules.maximumEtaMinutes !== undefined) {
    const eta = knownEtaMinutes(candidate);
    if (eta === null) {
      results.push(rule("maximumEtaMinutes", "unknown", `No ETA (advertised or quoted) is on record for ${candidate.providerSlug}.`, "eta_limit_exceeded"));
    } else if (eta > rules.maximumEtaMinutes) {
      results.push(rule("maximumEtaMinutes", "fail", `Known ETA is ${Math.round(eta)} minutes, exceeding the policy's ${rules.maximumEtaMinutes}-minute limit.`, "eta_limit_exceeded"));
    }
  }

  if (rules.denyDuringActiveIncident && candidate.hasActiveIncident) {
    results.push(rule("denyDuringActiveIncident", "fail", `${candidate.providerSlug} has an active, unresolved incident.`, "active_provider_incident"));
  }

  if (rules.minimumObservedReliability !== undefined) {
    if (candidate.healthOkRatio === null) {
      results.push(rule("minimumObservedReliability", "fail", `No health observations on record for ${candidate.providerSlug} - reliability cannot be proven.`, "insufficient_reliability_data"));
    } else if (candidate.healthOkRatio < rules.minimumObservedReliability) {
      results.push(
        rule(
          "minimumObservedReliability",
          "fail",
          `Observed reliability ${(candidate.healthOkRatio * 100).toFixed(0)}% is below the policy's ${(rules.minimumObservedReliability * 100).toFixed(0)}% minimum.`,
          "reliability_below_threshold",
        ),
      );
    }
  }

  if (!rules.allowAggregators) {
    const looksLikeAggregator = candidate.providerCategory.toLowerCase().includes("aggregator");
    if (looksLikeAggregator) {
      results.push(rule("allowAggregators", "fail", `${candidate.providerSlug}'s category ("${candidate.providerCategory}") indicates an aggregator, which this policy excludes.`, "aggregator_not_allowed"));
    } else {
      // Railor has no controlled provider-type taxonomy (see PolicyRules.allowAggregators) -
      // a category that doesn't literally say "aggregator" is not proof it isn't one.
      results.push(rule("allowAggregators", "unknown", `Railor cannot verify whether ${candidate.providerSlug} is an aggregator from its recorded category ("${candidate.providerCategory}").`, "aggregator_not_allowed"));
    }
  }

  const aggregate: PolicyEvalResult = results.some((r) => r.result === "fail")
    ? "fail"
    : results.some((r) => r.result === "unknown")
      ? "unknown"
      : "pass";

  if (aggregate === "pass" && results.length === 0) {
    results.push(rule("no_configured_rules", "pass", "This policy version configures no rules that apply to this candidate.", "policy_pass"));
  }

  return { result: aggregate, ruleResults: results };
}

/** True ranking preference, not a gate: preferDirectProvider never fails a candidate, only nudges final ranking (see decision-engine.ts). Same real-data caveat as allowAggregators - a category not literally saying "aggregator" is the only signal Railor has for "direct". */
export function directProviderBonus(rules: PolicyRules, providerCategory: string): number {
  if (!rules.preferDirectProvider) return 0;
  return providerCategory.toLowerCase().includes("aggregator") ? 0 : 1;
}
