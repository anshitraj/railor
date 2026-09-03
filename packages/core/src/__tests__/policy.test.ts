/**
 * The deterministic Policy Evaluator, pure — no DB, no network, mirrors
 * adapters.test.ts's "fail-closed behavior only" discipline: every case here
 * asserts a specific PASS/FAIL/UNKNOWN/NOT_APPLICABLE outcome and its reason
 * code, never just "truthy".
 */
import { describe, expect, it } from "vitest";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { evaluatePolicy, type PolicyCandidateInput } from "../policy.js";
import type { UnifiedQuote } from "../unified.js";

const now = new Date("2026-09-03T00:00:00.000Z");

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return PaymentIntent.parse({
    sourceEntityCountry: "IN",
    destinationCountry: "AE",
    destinationCurrency: "AED",
    sourceAsset: "USDC",
    sourceNetwork: "base",
    amount: 1000,
    ...overrides,
  });
}

function rules(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return PolicyRules.parse(overrides);
}

function candidate(overrides: Partial<PolicyCandidateInput> = {}): PolicyCandidateInput {
  return {
    providerId: "provider-1",
    providerSlug: "circle",
    providerCategory: "Stablecoin infrastructure",
    routeConfirmation: "confirmed",
    lastVerifiedAt: now,
    connected: true,
    quote: null,
    advertisedFeeCostBps: 50,
    advertisedSettlementMinutes: 60,
    healthOkRatio: 0.99,
    hasActiveIncident: false,
    ...overrides,
  };
}

function quote(overrides: Partial<UnifiedQuote> = {}): UnifiedQuote {
  return {
    providerSlug: "circle",
    sourceAsset: "USDC",
    destinationCurrency: "AED",
    amount: 1000,
    costPartial: false,
    quoteType: "live",
    accountContext: "customer_connected",
    verificationType: "provider_reported",
    observedAt: now.toISOString(),
    quotedAt: now.toISOString(),
    ...overrides,
  };
}

describe("evaluatePolicy — no configured rules", () => {
  it("passes with an explicit policy_pass code when nothing is configured", () => {
    const result = evaluatePolicy(intent(), rules(), candidate(), now);
    expect(result.result).toBe("pass");
    expect(result.ruleResults.some((r) => r.code === "policy_pass")).toBe(true);
  });
});

describe("provider allow/deny", () => {
  it("provider deny: fails with provider_denied", () => {
    const result = evaluatePolicy(intent(), rules({ providerDenylist: ["circle"] }), candidate(), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "provider_denied")).toBeDefined();
  });

  it("provider allow: a provider not on the allowlist fails with provider_not_allowed", () => {
    const result = evaluatePolicy(intent(), rules({ providerAllowlist: ["bridge"] }), candidate({ providerSlug: "circle" }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "provider_not_allowed")).toBeDefined();
  });

  it("provider allow: a provider on the allowlist passes", () => {
    const result = evaluatePolicy(intent(), rules({ providerAllowlist: ["circle"] }), candidate({ providerSlug: "circle" }), now);
    expect(result.result).toBe("pass");
  });
});

describe("network deny", () => {
  it("fails with network_denied when the intent's network is on the denylist", () => {
    const result = evaluatePolicy(intent({ sourceNetwork: "tron" }), rules({ deniedNetworks: ["tron"] }), candidate(), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "network_denied")).toBeDefined();
  });
});

describe("asset deny", () => {
  it("fails with asset_denied when the intent's asset is on the denylist", () => {
    const result = evaluatePolicy(intent({ sourceAsset: "USDT" }), rules({ deniedAssets: ["USDT"] }), candidate(), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "asset_denied")).toBeDefined();
  });
});

describe("minimum route certainty", () => {
  it("fails a partially_confirmed candidate when the policy requires confirmed", () => {
    const result = evaluatePolicy(
      intent(),
      rules({ minimumRouteCertainty: "confirmed" }),
      candidate({ routeConfirmation: "partially_confirmed" }),
      now,
    );
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "route_certainty_too_low")).toBeDefined();
  });

  it("never lets UNCONFIRMED silently pass a certainty requirement", () => {
    const result = evaluatePolicy(intent(), rules({ minimumRouteCertainty: "confirmed" }), candidate({ routeConfirmation: "unconfirmed" }), now);
    expect(result.result).toBe("fail");
  });

  it("never lets UNKNOWN silently pass a certainty requirement", () => {
    const result = evaluatePolicy(intent(), rules({ minimumRouteCertainty: "partially_confirmed" }), candidate({ routeConfirmation: "unknown" }), now);
    expect(result.result).toBe("fail");
  });

  it("passes a confirmed candidate against a confirmed requirement", () => {
    const result = evaluatePolicy(intent(), rules({ minimumRouteCertainty: "confirmed" }), candidate({ routeConfirmation: "confirmed" }), now);
    expect(result.result).toBe("pass");
  });
});

describe("require exact route evidence", () => {
  it("fails anything short of exactly confirmed", () => {
    const result = evaluatePolicy(intent(), rules({ requireExactRouteEvidence: true }), candidate({ routeConfirmation: "partially_confirmed" }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "exact_route_required")).toBeDefined();
  });
});

describe("evidence freshness", () => {
  it("fails when evidence is older than the policy's max age", () => {
    const old = new Date(now.getTime() - 1000 * 3_600_000); // ~41 days
    const result = evaluatePolicy(intent(), rules({ maximumEvidenceAgeHours: 720 }), candidate({ lastVerifiedAt: old }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "evidence_too_old")).toBeDefined();
  });

  it("fails (not passes) when there is no evidence timestamp at all", () => {
    const result = evaluatePolicy(intent(), rules({ maximumEvidenceAgeHours: 720 }), candidate({ lastVerifiedAt: null }), now);
    expect(result.result).toBe("fail");
  });

  it("passes when evidence is within the max age", () => {
    const recent = new Date(now.getTime() - 3_600_000);
    const result = evaluatePolicy(intent(), rules({ maximumEvidenceAgeHours: 720 }), candidate({ lastVerifiedAt: recent }), now);
    expect(result.result).toBe("pass");
  });
});

describe("require connected provider", () => {
  it("fails when not connected", () => {
    const result = evaluatePolicy(intent(), rules({ requireCustomerConnectedProvider: true }), candidate({ connected: false }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "provider_not_connected")).toBeDefined();
  });

  it("passes when connected", () => {
    const result = evaluatePolicy(intent(), rules({ requireCustomerConnectedProvider: true }), candidate({ connected: true }), now);
    expect(result.result).toBe("pass");
  });
});

describe("require live quote", () => {
  it("fails with no quote at all", () => {
    const result = evaluatePolicy(intent(), rules({ requireLiveQuote: true }), candidate({ quote: null }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "live_quote_required")).toBeDefined();
  });

  it("fails with an indicative (not live) quote", () => {
    const result = evaluatePolicy(intent(), rules({ requireLiveQuote: true }), candidate({ quote: quote({ quoteType: "indicative" }) }), now);
    expect(result.result).toBe("fail");
  });

  it("passes with a real live quote", () => {
    const result = evaluatePolicy(intent(), rules({ requireLiveQuote: true }), candidate({ quote: quote({ quoteType: "live" }) }), now);
    expect(result.result).toBe("pass");
  });
});

describe("cost limit — missing/partial quote must never become zero or falsely-complete cost", () => {
  it("reports unknown, not pass, when no cost figure exists at all", () => {
    const result = evaluatePolicy(intent(), rules({ maximumKnownCostBps: 100 }), candidate({ advertisedFeeCostBps: null, quote: null }), now);
    expect(result.result).toBe("unknown");
    expect(result.ruleResults.find((r) => r.code === "cost_limit_exceeded")?.result).toBe("unknown");
  });

  it("a partial quote never satisfies a cost ceiling when no advertised fallback exists — never treated as zero cost", () => {
    const partial = quote({ costPartial: true, feeAmount: 1 }); // a suspiciously tiny partial fee
    const result = evaluatePolicy(intent(), rules({ maximumKnownCostBps: 100 }), candidate({ advertisedFeeCostBps: null, quote: partial }), now);
    expect(result.result).toBe("unknown");
  });

  it("falls back to the advertised rate when the only quote is partial", () => {
    const partial = quote({ costPartial: true, feeAmount: 1 });
    const result = evaluatePolicy(intent(), rules({ maximumKnownCostBps: 100 }), candidate({ advertisedFeeCostBps: 500, quote: partial }), now);
    // 500bps advertised > 100bps ceiling -> fail, proving the tiny partial number was NOT used to sneak past the limit.
    expect(result.result).toBe("fail");
  });

  it("fails when a complete quote's real cost exceeds the ceiling", () => {
    const complete = quote({ costPartial: false, feeAmount: 50, amount: 1000 }); // 500bps
    const result = evaluatePolicy(intent(), rules({ maximumKnownCostBps: 100 }), candidate({ quote: complete }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "cost_limit_exceeded")?.result).toBe("fail");
  });

  it("passes when a complete quote's real cost is within the ceiling", () => {
    const complete = quote({ costPartial: false, feeAmount: 5, amount: 1000 }); // 50bps
    const result = evaluatePolicy(intent(), rules({ maximumKnownCostBps: 100 }), candidate({ quote: complete }), now);
    expect(result.result).toBe("pass");
  });
});

describe("ETA limit", () => {
  it("reports unknown with no ETA data", () => {
    const result = evaluatePolicy(intent(), rules({ maximumEtaMinutes: 60 }), candidate({ advertisedSettlementMinutes: null, quote: null }), now);
    expect(result.result).toBe("unknown");
  });

  it("fails when the known ETA exceeds the limit", () => {
    const result = evaluatePolicy(intent(), rules({ maximumEtaMinutes: 30 }), candidate({ advertisedSettlementMinutes: 60 }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "eta_limit_exceeded")).toBeDefined();
  });
});

describe("active incident", () => {
  it("fails during an active incident when the policy denies it", () => {
    const result = evaluatePolicy(intent(), rules({ denyDuringActiveIncident: true }), candidate({ hasActiveIncident: true }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "active_provider_incident")).toBeDefined();
  });

  it("passes with no active incident", () => {
    const result = evaluatePolicy(intent(), rules({ denyDuringActiveIncident: true }), candidate({ hasActiveIncident: false }), now);
    expect(result.result).toBe("pass");
  });
});

describe("unknown / insufficient reliability", () => {
  it("fails with insufficient_reliability_data when Railor has zero health observations — never defaulted to perfect", () => {
    const result = evaluatePolicy(intent(), rules({ minimumObservedReliability: 0.9 }), candidate({ healthOkRatio: null }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "insufficient_reliability_data")).toBeDefined();
  });

  it("fails with reliability_below_threshold when real data is below the bar", () => {
    const result = evaluatePolicy(intent(), rules({ minimumObservedReliability: 0.9 }), candidate({ healthOkRatio: 0.5 }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "reliability_below_threshold")).toBeDefined();
  });

  it("passes when real reliability meets the bar", () => {
    const result = evaluatePolicy(intent(), rules({ minimumObservedReliability: 0.9 }), candidate({ healthOkRatio: 0.95 }), now);
    expect(result.result).toBe("pass");
  });
});

describe("approval threshold — humanApprovalAboveAmount is a decision-level flag, not a candidate rule", () => {
  it("does not appear as a per-candidate rule result at all (handled by decision-engine.ts at the Decision level)", () => {
    const result = evaluatePolicy(intent({ amount: 1_000_000 }), rules({ humanApprovalAboveAmount: 10_000 }), candidate(), now);
    expect(result.ruleResults.some((r) => r.rule === "humanApprovalAboveAmount")).toBe(false);
  });
});

describe("not-yet-enforceable rules never fabricate a verdict", () => {
  it("allowPrefunding: false reports not_applicable, never a fabricated pass or fail", () => {
    const result = evaluatePolicy(intent(), rules({ allowPrefunding: false }), candidate(), now);
    const prefunding = result.ruleResults.find((r) => r.rule === "allowPrefunding");
    expect(prefunding?.result).toBe("not_applicable");
  });

  it("allowAggregators: false reports unknown for a category that doesn't literally say aggregator — never fabricates a classification", () => {
    const result = evaluatePolicy(intent(), rules({ allowAggregators: false }), candidate({ providerCategory: "Cross-border payments" }), now);
    const agg = result.ruleResults.find((r) => r.rule === "allowAggregators");
    expect(agg?.result).toBe("unknown");
    expect(result.result).toBe("unknown");
  });

  it("allowAggregators: false does fail a candidate whose category literally says aggregator", () => {
    const result = evaluatePolicy(intent(), rules({ allowAggregators: false }), candidate({ providerCategory: "Aggregator" }), now);
    expect(result.result).toBe("fail");
    expect(result.ruleResults.find((r) => r.code === "aggregator_not_allowed" && r.result === "fail")).toBeDefined();
  });
});

describe("hard failure can never be outvoted by passing rules", () => {
  it("one fail among many passes still aggregates to fail", () => {
    const result = evaluatePolicy(
      intent(),
      rules({ providerDenylist: ["circle"], requireCustomerConnectedProvider: true, denyDuringActiveIncident: true }),
      candidate({ connected: true, hasActiveIncident: false }),
      now,
    );
    expect(result.result).toBe("fail");
  });
});
