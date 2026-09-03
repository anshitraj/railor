import { describe, expect, it } from "vitest";
import { scoreProvider, type ProviderInput } from "../eligibility.js";
import type { Evaluation } from "../eligibility.js";
import type { EligibilityVerdict } from "@railor/types";

function provider(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    id: "provider-1",
    slug: "example",
    name: "Example Provider",
    category: "Test",
    isDemo: false,
    products: ["payout"],
    facets: [],
    advertisedSettlement: "Instant",
    onboardingDays: 3,
    hasApi: true,
    hasSandbox: false,
    lastVerifiedAt: new Date(),
    requirementKeys: [],
    requirementLabels: {},
    healthOkRatio: 0.99,
    destinationCountryCount: 8,
    feeCostBps: 20,
    ...overrides,
  };
}

function evaluation(verdict: EligibilityVerdict, confidence = 0.9): Evaluation {
  return {
    verdict,
    confidence,
    band: "high",
    reasons: [],
    outstandingRequirements: [],
    lastVerifiedAt: new Date(),
    matchedProduct: "payout",
    evidence: [],
    receivingMode: null,
    operationalReadiness: "not_tested",
    routeConfirmation: null,
    confirmedDimensions: [],
    unconfirmedDimensions: [],
    dependedOnRouteId: null,
    entityEligibility: null,
  };
}

describe("scoreProvider — hard filters dominate ranking", () => {
  it("never lets an unavailable provider's excellent raw factors outscore a supported provider's mediocre ones", () => {
    const excellentFactors = provider({ feeCostBps: 20, onboardingDays: 3, healthOkRatio: 1, advertisedSettlement: "Instant" });
    const mediocreFactors = provider({ feeCostBps: 180, onboardingDays: 40, healthOkRatio: 0.5, advertisedSettlement: "T+2" });

    const unavailableButExcellent = scoreProvider(excellentFactors, evaluation("unavailable"), "balanced");
    const supportedButMediocre = scoreProvider(mediocreFactors, evaluation("supported"), "balanced");

    expect(supportedButMediocre.score).toBeGreaterThan(unavailableButExcellent.score);
  });

  it("strictly orders the eligibility gate itself regardless of preset: supported > additional_requirements > unknown > unavailable", () => {
    const p = provider();
    const supported = scoreProvider(p, evaluation("supported"), "balanced").score;
    const additional = scoreProvider(p, evaluation("additional_requirements"), "balanced").score;
    const unknown = scoreProvider(p, evaluation("unknown"), "balanced").score;
    const unavailable = scoreProvider(p, evaluation("unavailable"), "balanced").score;
    expect(supported).toBeGreaterThan(additional);
    expect(additional).toBeGreaterThan(unknown);
    expect(unknown).toBeGreaterThan(unavailable);
  });
});

describe("scoreProvider — customer preference modes", () => {
  it("most_reliable: a provider with zero health observations is honestly unranked on reliability, not defaulted", () => {
    const noHealthData = provider({ healthOkRatio: null });
    const result = scoreProvider(noHealthData, evaluation("supported"), "most_reliable");
    expect(result.rankingInputsMissing).toContain("reliability");
    expect(result.rankingInputsUsed).not.toContain("reliability");
    expect(result.rankingConfidence).toBeLessThan(1);
  });

  it("most_reliable ranks a highly reliable provider above a shakier one with better fees", () => {
    const reliable = provider({ healthOkRatio: 0.99, feeCostBps: 150 });
    const shaky = provider({ healthOkRatio: 0.4, feeCostBps: 20 });
    const reliableScore = scoreProvider(reliable, evaluation("supported"), "most_reliable").score;
    const shakyScore = scoreProvider(shaky, evaluation("supported"), "most_reliable").score;
    expect(reliableScore).toBeGreaterThan(shakyScore);
  });

  it("max_recipient_amount uses published fee as its dominant real input", () => {
    const cheap = provider({ feeCostBps: 20 });
    const result = scoreProvider(cheap, evaluation("supported"), "max_recipient_amount");
    expect(result.rankingInputsUsed).toContain("cost");
  });
});
