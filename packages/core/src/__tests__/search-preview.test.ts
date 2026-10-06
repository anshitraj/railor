import { describe, expect, it } from "vitest";
import { PaymentIntent } from "@railor/types";
import { normalizeSearchCandidate, projectSearchPreview } from "../search-preview.js";
import type { DecisionCandidateInsert, DecisionInsert } from "../decision-repository.js";

const intent = PaymentIntent.parse({ sourceEntityCountry: "IN", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "DE", destinationCurrency: "EUR", amount: 50_000 });

function candidate(overrides: Partial<DecisionCandidateInsert> = {}): DecisionCandidateInsert {
  return {
    providerId: "provider-1", providerSlug: "circle", providerName: "Circle", routeId: "route-1",
    eligibilityStatus: "supported", routeCertainty: "confirmed", entityEligibility: "confirmed",
    policyEvaluation: { result: "pass", ruleResults: [] },
    dependencySnapshot: { connected: true, quoteCapable: true, activeIncident: false, rankingScore: 80, rankingConfidence: 0.8,
      lastVerifiedAt: "2026-10-05T00:00:00Z", evidence: [{ sourceUrl: "https://example.com/evidence" }] },
    quoteSnapshot: null, costCompleteness: "unknown", reliabilitySnapshot: null, rank: 1, selected: true,
    rejectionReasonCodes: [], evidenceIds: ["evidence-1"], ...overrides,
  };
}

function decision(candidates: DecisionCandidateInsert[]): DecisionInsert {
  return { organizationId: "org-1", intentSnapshot: intent, policyId: "policy-1", policyVersionId: "version-1", policyVersionNumber: 1,
    engineVersion: "test", status: "allow", recommendedProviderId: "provider-1", recommendedProviderSlug: "circle", recommendedRouteId: "route-1",
    certainty: "confirmed", rankingConfidence: 0.8, quoteState: "none", connectionState: "connected", validUntil: null,
    revalidationRequired: false, decisionHash: "hash", warnings: [], explain: { missingInformation: [], whatWouldChange: [] }, previousDecisionId: null, candidates };
}

describe("read-only search candidate projection", () => {
  it("classifies a genuine connected live quote and keeps partial cost explicit", () => {
    const result = normalizeSearchCandidate(candidate({ quoteSnapshot: { amount: 50_000, recipientAmount: 46_000, feeAmount: 5,
      feeCurrency: "EUR", costPartial: true, quoteType: "live", accountContext: "customer_connected", observedAt: "2026-10-05T00:00:00Z" }, costCompleteness: "partial" }));
    expect(result.quoteState).toBe("LIVE_CONNECTED");
    expect(result.costCompleteness).toBe("partial");
    expect(result.recipientAmount).toBe(46_000);
  });
  it("does not relabel indicative or network-context pricing as customer live", () => {
    const quote = { amount: 50_000, costPartial: true, observedAt: "2026-10-05T00:00:00Z", accountContext: "customer_connected" as const };
    expect(normalizeSearchCandidate(candidate({ quoteSnapshot: { ...quote, quoteType: "indicative" } })).quoteState).toBe("INDICATIVE");
    expect(normalizeSearchCandidate(candidate({ quoteSnapshot: { ...quote, quoteType: "live", accountContext: "railor_network" } })).quoteState).toBe("QUOTE_UNAVAILABLE");
  });
  it("distinguishes unconnected, missing quote, unsupported and unknown", () => {
    expect(normalizeSearchCandidate(candidate({ dependencySnapshot: { connected: false, quoteCapable: true } })).quoteState).toBe("CONNECT_TO_QUOTE");
    expect(normalizeSearchCandidate(candidate()).quoteState).toBe("QUOTE_UNAVAILABLE");
    expect(normalizeSearchCandidate(candidate({ dependencySnapshot: { connected: false, quoteCapable: false } })).quoteState).toBe("QUOTE_UNAVAILABLE");
    expect(normalizeSearchCandidate(candidate({ routeCertainty: "unsupported", eligibilityStatus: "unavailable" })).quoteState).toBe("ROUTE_UNAVAILABLE");
    expect(normalizeSearchCandidate(candidate({ routeCertainty: "unknown", eligibilityStatus: "unknown" })).quoteState).toBe("UNKNOWN");
  });
  it("never recommends a denied candidate, or claims cheapest with no complete quote", () => {
    const denied = candidate({ providerId: "p2", providerSlug: "denied", providerName: "Denied", policyEvaluation: { result: "fail", ruleResults: [{ rule: "providerDenylist", result: "fail", code: "provider_denied", message: "Blocked" }] }, rank: null, selected: false });
    const preview = projectSearchPreview(intent, decision([candidate(), denied]));
    expect(preview.bestCandidate?.providerSlug).toBe("circle");
    expect(preview.rejectedCandidates[0]?.providerSlug).toBe("denied");
    expect(preview.executionState).toBe("NOT_INITIATED");
    const cheapest = projectSearchPreview({ ...intent, preference: "cheapest" }, decision([candidate(), denied]));
    expect(cheapest.bestCandidate).toBeNull();
  });
});
