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
        expect.objectContaining({ providerSlug: "cashfree", currencyMatch: "destination" }),
        expect.objectContaining({ providerSlug: "xflow", currencyMatch: "both" }),
      ]),
    );
  });

  it("returns only providers that list the selected destination currency", () => {
    const coverage = providerMarketCoverage({ sourceCurrency: "EUR", destinationCurrency: "PHP", amount: 500 });

    expect(coverage.providers.length).toBe(coverage.matched);
    expect(coverage.providers.every((provider) => provider.currencyMatch === "both" || provider.currencyMatch === "destination")).toBe(true);
  });
});
