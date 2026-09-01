/**
 * Named rail + receiving-endpoint filtering. Before this, `CorridorQuery` had
 * no way to ask for a specific rail — "GBP Faster Payments", "GBP Bacs" and
 * "GBP CHAPS" all evaluated identically because nothing distinguished them.
 * `endpointType` (bank_account vs mobile_money vs ...) and `namedRail`
 * (SEPA_INSTANT, MPESA, ...) are two independent axes on the same fact, and
 * must never collapse into `paymentMethod`'s generic buckets.
 */
import { describe, expect, it } from "vitest";
import { evaluateProvider, type CapabilityFacet, type ProviderInput } from "../eligibility.js";

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

describe("named rail + receiving endpoint filtering", () => {
  it("distinguishes two named rails on the same destination/currency instead of matching both identically", () => {
    const twoRails = provider([
      facet({ destinationCountry: "GB", destinationCurrency: "GBP", endpointType: "bank_account", namedRailCode: "FASTER_PAYMENTS_GB", namedRailName: "Faster Payments" }),
      facet({ destinationCountry: "GB", destinationCurrency: "GBP", endpointType: "bank_account", namedRailCode: "CHAPS", namedRailName: "CHAPS" }),
    ]);

    const faster = evaluateProvider(twoRails, { customerType: "business", destinationCountry: "GB", destinationCurrency: "GBP", namedRail: "FASTER_PAYMENTS_GB" }, { now: verifiedAt });
    const chaps = evaluateProvider(twoRails, { customerType: "business", destinationCountry: "GB", destinationCurrency: "GBP", namedRail: "CHAPS" }, { now: verifiedAt });
    const bacs = evaluateProvider(twoRails, { customerType: "business", destinationCountry: "GB", destinationCurrency: "GBP", namedRail: "BACS" }, { now: verifiedAt });

    expect(faster.verdict).toBe("supported");
    expect(chaps.verdict).toBe("supported");
    // A rail this provider never mentioned must not silently inherit the other two rails' SUPPORTED verdict.
    expect(bacs.verdict).toBe("unknown");
    expect(bacs.reasons.some((r) => /Faster Payments|CHAPS/.test(r.alsoTrue.join(" ")))).toBe(true);
  });

  it("keeps endpointType and namedRail as independent axes — mobile_money/M_PESA is not bank_account/M_PESA", () => {
    const kenya = provider([
      facet({ destinationCountry: "KE", destinationCurrency: "KES", endpointType: "bank_account", namedRailCode: "KEPSS" }),
      facet({ destinationCountry: "KE", destinationCurrency: "KES", endpointType: "mobile_money", namedRailCode: "MPESA", namedRailName: "M-PESA" }),
    ]);

    const mpesa = evaluateProvider(kenya, { customerType: "business", destinationCountry: "KE", destinationCurrency: "KES", endpointType: "mobile_money", namedRail: "MPESA" }, { now: verifiedAt });
    expect(mpesa.verdict).toBe("supported");

    // Same named rail code, wrong endpoint type — must not match the bank_account/KEPSS row.
    const wrongEndpoint = evaluateProvider(kenya, { customerType: "business", destinationCountry: "KE", destinationCurrency: "KES", endpointType: "bank_account", namedRail: "MPESA" }, { now: verifiedAt });
    expect(wrongEndpoint.verdict).toBe("unknown");
  });

  it("never reduces a named rail to the generic bank_transfer_local payment-method bucket", () => {
    const sepaOnly = provider([
      facet({ destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa", endpointType: "bank_account", namedRailCode: "SEPA_INSTANT", namedRailName: "SEPA Instant" }),
    ]);

    // Same currency/method/endpoint type, but a rail this provider never claimed.
    const instant = evaluateProvider(sepaOnly, { customerType: "business", destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa", namedRail: "SEPA_INSTANT" }, { now: verifiedAt });
    const creditTransfer = evaluateProvider(sepaOnly, { customerType: "business", destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa", namedRail: "SEPA_CREDIT_TRANSFER" }, { now: verifiedAt });

    expect(instant.verdict).toBe("supported");
    expect(creditTransfer.verdict).toBe("unknown");
  });

  it("a query with no endpointType/namedRail evaluates exactly as before (backward compatible)", () => {
    const result = evaluateProvider(
      provider([facet({ destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa" })]),
      { customerType: "business", destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa" },
      { now: verifiedAt },
    );
    expect(result.verdict).toBe("supported");
  });

  it("an exact multidimensional route request also honors namedRail — no cross-join across independent facets", () => {
    const provider2 = provider([
      facet({ sourceAsset: "USDC", sourceNetwork: "base" }),
      facet({ destinationCountry: "DE", destinationCurrency: "EUR", endpointType: "bank_account", namedRailCode: "SEPA_INSTANT" }),
    ]);

    const result = evaluateProvider(
      provider2,
      { customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "DE", destinationCurrency: "EUR", namedRail: "SEPA_INSTANT" },
      { now: verifiedAt },
    );

    // Asset/network and the SEPA_INSTANT destination are two independently-documented facts, never proven together.
    expect(result.verdict).toBe("unknown");
    expect(result.reasons.some((r) => /exact route combination/i.test(r.message))).toBe(true);
  });
});
