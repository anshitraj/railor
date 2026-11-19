import { describe, expect, it, vi } from "vitest";

const evaluate = vi.hoisted(() => vi.fn());
const research = vi.hoisted(() => ({ start: vi.fn(), read: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@railor/core", () => ({
  PRODUCT_TERMS: [{ product: "payout", label: "Payouts" }],
  evaluateProvider: evaluate,
  priceWebChecks: research.start,
  readWebChecks: research.read,
  registrableDomain: (url: string) => new URL(url).hostname,
  loadReferenceData: async () => ({ countries: [{ code: "US", name: "United States" }, { code: "MX", name: "Mexico" }, { code: "IN", name: "India" }, { code: "AR", name: "Argentina" }] }),
  loadProviderInputs: async () => ["left", "right", "1money", "airwallex"].map(slug => ({ slug, isDemo: false, facets: [{ id: "route", destinationCurrency: "MXN" }] })),
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
import { addRouteComparisonResearch } from "./route-comparison-research";

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

  it("shows source-backed reference terms without treating India to Argentina as a confirmed personal route", async () => {
    evaluate.mockReturnValue({
      verdict: "unavailable", matchedProduct: null, evidence: [],
      reasons: [{ code: "product_unavailable", message: "No product", wouldChange: [] }],
    });
    const request = RouteComparisonRequest.parse({ providers: ["1money", "airwallex"], from: "IN", to: "AR", customerType: "individual" });
    const result = await buildRouteComparison(request);
    const [money, airwallex] = result!.candidates;
    expect(money).toMatchObject({ verdict: "additional_requirements", reason: expect.stringContaining("specific 1Money program") });
    expect(money!.facts).toContainEqual(expect.objectContaining({
      label: "Published fees", value: expect.stringContaining("$25 withdrawal"),
      source: expect.objectContaining({ url: "https://www.1money.com/pricing" }),
    }));
    expect(airwallex).toMatchObject({ verdict: "unavailable", reason: expect.stringContaining("requires a business account") });
    expect(airwallex!.facts).toContainEqual(expect.objectContaining({
      label: "Tax on transfer", value: expect.stringContaining("1.20%"), detail: expect.stringContaining("eligible business accounts"),
    }));
    const unrelated = await buildRouteComparison({ ...request, to: "MX", product: "collection" });
    expect(JSON.stringify(unrelated)).not.toMatch(/1\.20%|\$25 withdrawal|specific 1Money program/);
  });

  it("fills a missing fact from the cached official quote without scheduling another search", async () => {
    evaluate.mockReturnValue({
      verdict: "unknown", matchedProduct: "payout", evidence: [],
      reasons: [{ message: "Exact route unverified", wouldChange: [] }],
    });
    const request = RouteComparisonRequest.parse({ providers: ["left", "right"], from: "US", to: "MX", customerType: "individual" });
    const comparison = (await buildRouteComparison(request))!;
    research.start.mockImplementationOnce(async claims => ({ results: [], pending: new Set(claims.map((claim: { key: string }) => claim.key)) }));
    expect((await addRouteComparisonResearch(comparison, "start")).pendingWebChecks).toBe(true);
    research.read.mockImplementationOnce(async (keys: string[]) => keys.map(key => ({
      key, official: key.includes(":left:"),
      verdict: "supported", quote: "US senders pay a $4 USD fee for a payout to Mexico.", sourceUrl: "https://provider.example/fees",
      checkedAt: "2026-11-19T00:00:00Z",
    })));
    const result = await addRouteComparisonResearch(comparison, "poll");
    expect(result.pendingWebChecks).toBe(false);
    expect(result.candidates[0]?.facts).toContainEqual(expect.objectContaining({
      label: "Published fees", value: expect.stringContaining("$4 USD"),
      source: expect.objectContaining({ url: "https://provider.example/fees" }),
    }));
    expect(result.candidates[0]?.verdict).toBe("unknown");
    expect(result.candidates[1]?.facts).toContainEqual(expect.objectContaining({ label: "Published fees", value: "Needs confirmation" }));
    expect(research.start).toHaveBeenCalledTimes(1);
  });
});
