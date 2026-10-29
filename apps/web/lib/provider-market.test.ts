import { describe, expect, it } from "vitest";
import { providerMarketCoverage } from "./provider-market";

describe("providerMarketCoverage", () => {
  it("surfaces the wider USD to INR market without presenting it as quotes", () => {
    const coverage = providerMarketCoverage({ sourceCurrency: "usd", destinationCurrency: "inr", amount: 1_000 });

    expect(coverage.totalTracked).toBeGreaterThan(50);
    expect(coverage.matched).toBeGreaterThan(3);
    expect(coverage.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerSlug: "airwallex", currencyMatch: "both" }),
        expect.objectContaining({ providerSlug: "cashfree", currencyMatch: "both" }),
        expect.objectContaining({ providerSlug: "xflow", currencyMatch: "both" }),
      ]),
    );
  });

  it("makes every audited provider searchable without pretending that each one has a confirmed quote", () => {
    const coverage = providerMarketCoverage({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 });
    expect(coverage.allProviders).toHaveLength(coverage.totalTracked);
    expect(coverage.totalTracked).toBeGreaterThanOrEqual(100);
    for (const providerSlug of ["pingpong", "karbon", "refrens", "salt"]) expect(coverage.allProviders).toEqual(expect.arrayContaining([expect.objectContaining({ providerSlug })]));
    expect(coverage.allProviders).toEqual(expect.arrayContaining([expect.objectContaining({ providerSlug: "razorpay" }), expect.objectContaining({ providerSlug: "dashx" }), expect.objectContaining({ providerSlug: "briskpe", currencyMatch: "unverified" })]));
    expect(coverage.allProviders?.find((provider) => provider.providerSlug === "briskpe")?.pricingStatus?.reason).toContain("not been verified");
  });

  it("returns only providers that list the selected destination currency", () => {
    const coverage = providerMarketCoverage({ sourceCurrency: "EUR", destinationCurrency: "PHP", amount: 500 });

    expect(coverage.providers.length).toBe(coverage.matched);
    expect(coverage.providers.every((provider) => provider.currencyMatch === "both" || provider.currencyMatch === "destination")).toBe(true);
  });
});
