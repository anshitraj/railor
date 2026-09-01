import { describe, expect, it } from "vitest";
import { evaluateProvider, type CapabilityFacet, type ProviderInput } from "../eligibility.js";
import { hasVerbatimCitation } from "../provider-research/ingest.js";

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
    evidenceExcerpt: "Supported route statement.",
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

describe("exact route evidence", () => {
  it("does not cross-join independently documented asset, network, and destination facts", () => {
    const result = evaluateProvider(
      provider([
        facet({ sourceAsset: "USDC" }),
        facet({ sourceNetwork: "base" }),
        facet({ destinationCountry: "AE", destinationCurrency: "AED" }),
      ]),
      { product: "payout", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED" },
      { now: verifiedAt },
    );

    expect(result.verdict).toBe("unknown");
    expect(result.reasons.some((reason) => /exact route combination/i.test(reason.message))).toBe(true);
  });

  it("accepts a route only when one evidence-backed facet carries the complete tuple", () => {
    const result = evaluateProvider(
      provider([
        facet({
          sourceAsset: "USDC",
          sourceNetwork: "base",
          destinationCountry: "AE",
          destinationCurrency: "AED",
          isAtomicRoute: true,
        }),
      ]),
      { product: "payout", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED" },
      { now: verifiedAt },
    );

    expect(result.verdict).toBe("supported");
  });

  it("requires entity, customer, source country, and source rail on the same atomic route", () => {
    const query = {
      product: "payout" as const,
      customerType: "business" as const,
      entityCountry: "DE",
      sourceCountry: "DE",
      sourceEndpointType: "bank_account" as const,
      sourceNamedRail: "SEPA",
      sourceAsset: "USDC",
      sourceNetwork: "base",
      sourceCurrency: "EUR",
      destinationCountry: "DE",
      destinationCurrency: "EUR",
      endpointType: "bank_account" as const,
      namedRail: "SEPA_INSTANT",
    };
    const incomplete = facet({
      entityCountry: "DE", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base",
      destinationCountry: "DE", destinationCurrency: "EUR", endpointType: "bank_account", namedRailCode: "SEPA_INSTANT",
      isAtomicRoute: true,
    });
    expect(evaluateProvider(provider([incomplete]), query, { now: verifiedAt }).verdict).toBe("unknown");

    const conditional = facet({
      entityCountry: "DE", customerType: "business", sourceCountry: "DE", sourceEndpointType: "bank_account", sourceNamedRail: "SEPA", sourceCurrency: "EUR",
      sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "DE", destinationCurrency: "EUR",
      endpointType: "bank_account", namedRailCode: "SEPA_INSTANT", isAtomicRoute: true,
      availability: "partial", note: "Enhanced KYB approval is required.",
    });
    expect(evaluateProvider(provider([conditional]), query, { now: verifiedAt }).verdict).toBe("additional_requirements");

    const unsupported = { ...conditional, id: crypto.randomUUID(), availability: "unsupported" as const };
    expect(evaluateProvider(provider([unsupported]), query, { now: verifiedAt }).verdict).toBe("unavailable");
  });

  it("requires a citation to include a verbatim source span, not merely an allowed URL", () => {
    const sources = [{ url: "https://provider.example/docs", title: "Docs", content: "USDC payouts are available on Base." }];

    expect(hasVerbatimCitation([sources[0]!.url], "USDC payouts are available on Base.", sources)).toBe(true);
    expect(hasVerbatimCitation([sources[0]!.url], "USDC payouts are available in every country.", sources)).toBe(false);
    expect(hasVerbatimCitation(["https://unrelated.example"], "USDC payouts are available on Base.", sources)).toBe(false);
  });

  it("keeps DEGRADED and ACCESS_REQUIRED operational states separate from the evidence verdict", () => {
    const exact = facet({ sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", isAtomicRoute: true });
    const query = { product: "payout" as const, customerType: "business" as const, sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED" };
    const degraded = evaluateProvider(provider([exact]), query, { now: verifiedAt, operationalReadiness: "degraded" });
    const accessRequired = evaluateProvider(provider([exact]), query, { now: verifiedAt, operationalReadiness: "access_required" });
    expect(degraded.verdict).toBe("supported");
    expect(degraded.operationalReadiness).toBe("degraded");
    expect(accessRequired.verdict).toBe("supported");
    expect(accessRequired.operationalReadiness).toBe("access_required");
  });
});
