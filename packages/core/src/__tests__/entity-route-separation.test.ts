/**
 * The evidence-model fix: entity/customer eligibility ("can this entity use
 * this provider at all") and atomic route confirmation ("does this transport
 * exist") are independently authoritative, genuinely orthogonal facts — not
 * one combined tuple. Every real provider_routes row is silent on entity
 * jurisdiction (entityCountry = null); before this fix that silence was
 * treated as "this row does not apply," so no real route could ever reach
 * RouteConfirmation "confirmed" for any entity-specific query. These tests
 * pin the fix: a jurisdiction-silent route is transport-compatible with any
 * entity, entity eligibility is tracked as its own fact, and an explicit
 * per-route jurisdiction dependency is still honored exactly, never
 * defaulted to "any" by a global NULL-as-wildcard rule.
 */
import { describe, expect, it } from "vitest";
import { evaluateProvider, isDecisionEligible, type CapabilityFacet, type Evaluation, type ProviderInput } from "../eligibility.js";

const verifiedAt = new Date("2026-08-28T00:00:00.000Z");

function facet(overrides: Partial<CapabilityFacet>): CapabilityFacet {
  return {
    id: crypto.randomUUID(),
    product: "payout",
    entityCountry: null,
    customerCountry: null,
    customerType: "business",
    sourceCountry: null,
    sourceEndpointType: null,
    sourceNamedRail: null,
    sourceAsset: null,
    sourceNetwork: null,
    sourceCurrency: null,
    destinationCountry: null,
    destinationCurrency: null,
    paymentMethod: null,
    availability: "supported",
    note: null,
    lastVerifiedAt: verifiedAt,
    evidenceConfidence: 0.95,
    evidenceSourceType: "official_docs",
    evidenceVerificationType: "provider_reported",
    evidenceId: "evidence-1",
    evidenceUrl: "https://provider.example/docs",
    evidenceTitle: "Provider docs",
    evidenceRetrievedAt: verifiedAt,
    evidenceRawHash: "hash",
    evidenceExcerpt: "Supported statement.",
    ...overrides,
  };
}

function provider(facets: CapabilityFacet[]): ProviderInput {
  return {
    id: "provider-1",
    slug: "example",
    name: "Example Provider",
    category: "Test",
    isDemo: false,
    products: ["payout"],
    facets,
    advertisedSettlement: null,
    onboardingDays: null,
    hasApi: true,
    hasSandbox: false,
    lastVerifiedAt: verifiedAt,
    requirementKeys: [],
    requirementLabels: {},
    healthOkRatio: 1,
    destinationCountryCount: 1,
  };
}

const routeQuery = {
  product: "payout" as const,
  customerType: "business" as const,
  entityCountry: "DE",
  sourceAsset: "USDC",
  sourceNetwork: "base",
  destinationCountry: "AE",
  destinationCurrency: "AED",
};

describe("route confirmation no longer depends on entity jurisdiction", () => {
  it("confirms a jurisdiction-silent atomic route for any queried entity country", () => {
    const silentRoute = facet({
      entityCountry: null,
      sourceAsset: "USDC",
      sourceNetwork: "base",
      destinationCountry: "AE",
      destinationCurrency: "AED",
      isAtomicRoute: true,
    });

    for (const entityCountry of ["DE", "US", "SG", "IN"]) {
      const result = evaluateProvider(provider([silentRoute]), { ...routeQuery, entityCountry }, { now: verifiedAt });
      expect(result.routeConfirmation).toBe("confirmed");
    }
  });

  it("still honors an atomic route that explicitly names its own entity-jurisdiction dependency", () => {
    const usOnlyRoute = facet({
      entityCountry: "US",
      sourceAsset: "USDC",
      sourceNetwork: "base",
      destinationCountry: "AE",
      destinationCurrency: "AED",
      isAtomicRoute: true,
    });

    const matching = evaluateProvider(provider([usOnlyRoute]), { ...routeQuery, entityCountry: "US" }, { now: verifiedAt });
    expect(matching.routeConfirmation).toBe("confirmed");

    // A different entity country must NOT be silently granted this route —
    // preserving the explicit dependency, not global NULL-as-wildcard.
    const mismatched = evaluateProvider(provider([usOnlyRoute]), { ...routeQuery, entityCountry: "DE" }, { now: verifiedAt });
    expect(mismatched.routeConfirmation).not.toBe("confirmed");
  });

  it("entityCountry is no longer counted in confirmedDimensions/unconfirmedDimensions — it is not a route dimension", () => {
    const silentRoute = facet({ sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", isAtomicRoute: true });
    const result = evaluateProvider(provider([silentRoute]), routeQuery, { now: verifiedAt });
    expect(result.confirmedDimensions.some((d) => /jurisdiction/i.test(d))).toBe(false);
    expect(result.unconfirmedDimensions.some((d) => /jurisdiction/i.test(d))).toBe(false);
  });
});

describe("entity eligibility is its own fact, with its own certainty", () => {
  it("is null when the query never names an entity country", () => {
    const result = evaluateProvider(provider([]), { product: "payout", customerType: "business" }, { now: verifiedAt });
    expect(result.entityEligibility).toBeNull();
  });

  it("is unknown when no entity-eligibility evidence exists at all", () => {
    const result = evaluateProvider(provider([]), { product: "payout", customerType: "business", entityCountry: "DE" }, { now: verifiedAt });
    expect(result.entityEligibility).toBe("unknown");
  });

  it("is confirmed from a standalone entity-only capability fact — no route fields required", () => {
    const entityFact = facet({ entityCountry: "DE", customerType: null, availability: "supported" });
    const result = evaluateProvider(provider([entityFact]), { product: "payout", customerType: "business", entityCountry: "DE" }, { now: verifiedAt });
    expect(result.entityEligibility).toBe("confirmed");
  });

  it("is unsupported when a provider explicitly excludes the entity country, and this excludes the candidate from decisions", () => {
    const entityFact = facet({ entityCountry: "CN", customerType: null, availability: "unsupported", note: "Not available in China." });
    const result = evaluateProvider(provider([entityFact]), { product: "payout", customerType: "business", entityCountry: "CN" }, { now: verifiedAt });
    expect(result.entityEligibility).toBe("unsupported");
    expect(result.verdict).toBe("unavailable");
    expect(isDecisionEligible(result)).toBe(false);
  });

  it("is partially_confirmed when a provider accepts the entity country with extra requirements", () => {
    const entityFact = facet({ entityCountry: "BR", customerType: null, availability: "partial", note: "Requires enhanced KYB." });
    const result = evaluateProvider(provider([entityFact]), { product: "payout", customerType: "business", entityCountry: "BR" }, { now: verifiedAt });
    expect(result.entityEligibility).toBe("partially_confirmed");
  });

  it("never infers one entity country's acceptance to another's", () => {
    const entityFact = facet({ entityCountry: "DE", customerType: null, availability: "supported" });
    const result = evaluateProvider(provider([entityFact]), { product: "payout", customerType: "business", entityCountry: "FR" }, { now: verifiedAt });
    expect(result.entityEligibility).toBe("unknown");
  });
});

describe("isDecisionEligible — the decision-plausibility gate", () => {
  function evaluation(overrides: Partial<Evaluation>): Evaluation {
    return {
      verdict: "unknown",
      confidence: 0.5,
      band: "medium",
      reasons: [],
      outstandingRequirements: [],
      lastVerifiedAt: verifiedAt,
      matchedProduct: "payout",
      evidence: [],
      receivingMode: null,
      operationalReadiness: "not_tested",
      routeConfirmation: null,
      confirmedDimensions: [],
      unconfirmedDimensions: [],
      dependedOnRouteId: null,
      entityEligibility: null,
      ...overrides,
    };
  }

  it("admits verdict=unknown when the route itself is confirmed or partially confirmed", () => {
    expect(isDecisionEligible(evaluation({ verdict: "unknown", routeConfirmation: "confirmed" }))).toBe(true);
    expect(isDecisionEligible(evaluation({ verdict: "unknown", routeConfirmation: "partially_confirmed" }))).toBe(true);
  });

  it("still excludes verdict=unknown when the route itself is not established", () => {
    expect(isDecisionEligible(evaluation({ verdict: "unknown", routeConfirmation: "unconfirmed" }))).toBe(false);
    expect(isDecisionEligible(evaluation({ verdict: "unknown", routeConfirmation: null }))).toBe(false);
  });

  it("always excludes an explicit unavailable verdict, regardless of routeConfirmation", () => {
    expect(isDecisionEligible(evaluation({ verdict: "unavailable", routeConfirmation: "confirmed" }))).toBe(false);
  });

  it("always admits supported and additional_requirements", () => {
    expect(isDecisionEligible(evaluation({ verdict: "supported", routeConfirmation: null }))).toBe(true);
    expect(isDecisionEligible(evaluation({ verdict: "additional_requirements", routeConfirmation: null }))).toBe(true);
  });
});

describe("composition: confirmed entity eligibility + confirmed route reaches an overall supported verdict", () => {
  it("mirrors the real Ramp Network / Germany shape — two independent facts, one candidate", () => {
    const entityFact = facet({ entityCountry: "DE", customerType: null, availability: "supported", note: "Germany is not on Ramp's unsupported-countries list." });
    const atomicRoute = facet({
      entityCountry: null,
      sourceAsset: "USDC",
      sourceNetwork: "ethereum",
      destinationCountry: "DE",
      destinationCurrency: "EUR",
      isAtomicRoute: true,
    });

    const result = evaluateProvider(
      provider([entityFact, atomicRoute]),
      { product: "payout", customerType: "business", entityCountry: "DE", sourceAsset: "USDC", sourceNetwork: "ethereum", destinationCountry: "DE", destinationCurrency: "EUR" },
      { now: verifiedAt },
    );

    expect(result.entityEligibility).toBe("confirmed");
    expect(result.routeConfirmation).toBe("confirmed");
    expect(result.verdict).toBe("supported");
    expect(isDecisionEligible(result)).toBe(true);
  });
});
