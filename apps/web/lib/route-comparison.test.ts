import { describe, expect, it, vi } from "vitest";

const evaluate = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@railor/core", () => ({
  PRODUCT_TERMS: [{ product: "payout", label: "Payouts" }],
  evaluateProvider: evaluate,
  loadReferenceData: async () => ({ countries: [{ code: "US", name: "United States" }, { code: "MX", name: "Mexico" }] }),
  loadProviderInputs: async () => ["left", "right"].map(slug => ({ slug, isDemo: false, facets: [{ id: "route", destinationCurrency: "MXN" }] })),
  loadProviderBySlug: async (slug: string) => ({
    provider: { slug, name: slug, isDemo: false, category: "Payments", onboardingDays: null, advertisedSettlement: "1–2 days", websiteUrl: "https://provider.example" },
    requirements: [
      { kind: "kyb", label: "Business registration", mandatory: true, customerType: "business", entityCountry: "US" },
      { kind: "kyc", label: "Personal ID", mandatory: true, customerType: "individual", entityCountry: "US" },
      { kind: "kyb", label: "Mexican company address", mandatory: true, customerType: "business", entityCountry: "MX" },
    ],
    fees: [
      { product: "payout", destinationCurrency: "MXN", summary: "MXN payout schedule" },
      { product: "collection", destinationCurrency: "MXN", summary: "Collection schedule" },
      { product: "payout", destinationCurrency: "USD", summary: "USD payout schedule" },
    ],
    limits: [],
    sources: [],
  }),
}));

import { buildRouteComparison } from "./route-comparison";
import { RouteComparisonRequest } from "./route-comparison-model";

describe("route comparison scope", () => {
  it("keeps documents and fee schedules tied to the selected route and profile", async () => {
    evaluate.mockReturnValue({
      verdict: "supported", matchedProduct: "payout", dependedOnRouteId: "route", evidence: [], reasons: [],
      receivingMode: { settlementEstimate: "Same day", namedRail: "SPEI" },
    });
    const request = RouteComparisonRequest.parse({ providers: ["left", "right"], from: "US", to: "MX", customerType: "business", product: "payout" });
    const result = await buildRouteComparison(request);
    expect(evaluate.mock.calls[0]?.[1]).toMatchObject({ sourceCountry: "US", entityCountry: "US", destinationCountry: "MX", customerType: "business" });
    const facts = result?.candidates[0]?.facts;
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "KYC / KYB requirements", value: "Business registration" }),
      expect.objectContaining({ label: "Published fees", value: "MXN payout schedule" }),
      expect.objectContaining({ label: "Published limits", value: "Needs confirmation" }),
      expect.objectContaining({ label: "Payout timing", value: "Same day", detail: "Published for the receiving method" }),
    ]));
    expect(JSON.stringify(result)).not.toMatch(/Collection schedule|Mexican company address|Personal ID|USD payout schedule/);
  });

  it("requires distinct providers and both countries", () => {
    expect(RouteComparisonRequest.safeParse({ providers: ["left", "left"], from: "US", to: "MX", customerType: "business" }).success).toBe(false);
    expect(RouteComparisonRequest.safeParse({ providers: ["left", "right"], from: "US", customerType: "business" }).success).toBe(false);
  });
});
