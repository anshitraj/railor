import { describe, expect, it } from "vitest";
import { attachMarketPricingEvidence } from "./market-pricing-evidence";
import type { MarketCoverage, PriceRow } from "@railor/core";

const coverage: MarketCoverage = { totalTracked: 77, matched: 1, providers: [{ providerSlug: "xflow", providerName: "Xflow", websiteUrl: "https://xflowpay.com", category: "Payout provider", currencyMatch: "both", lastVerified: null }] };
const fee = { providerSlug: "xflow", product: "payout", summary: "Account-specific FX markup and payout fees.", destinationCurrency: "INR", sourceUrl: "https://docs.xflowpay.com", observedAt: "2026-10-07T00:00:00Z" };
describe("captured market pricing evidence", () => {
  it("surfaces relevant captured fees without producing a numeric quote", () => {
    const result = attachMarketPricingEvidence(coverage, "INR", [], [], [fee, fee, { ...fee, destinationCurrency: "PHP", summary: "Unrelated fee" }]);
    expect(result.providers[0]?.feeEvidence).toHaveLength(1);
    expect(result.providers[0]?.pricingStatus?.label).toBe("Captured fee information");
    expect(result.providers[0]).not.toHaveProperty("recipientAmount");
    expect(coverage.providers[0]).not.toHaveProperty("feeEvidence");
  });
  it("keeps provider failure reasons and hides unsafe source links", () => {
    const result = attachMarketPricingEvidence(coverage, "INR", [], [{ providerSlug: "xflow", providerName: "Xflow", reason: "Production access required." }], [{ ...fee, sourceUrl: "javascript:alert(1)" }]);
    expect(result.providers[0]?.pricingStatus?.reason).toBe("Production access required.");
    expect(result.providers[0]?.feeEvidence?.[0]?.sourceUrl).toBeNull();
  });
  it("identifies price rows already shown while preserving partial-cost labels", () => {
    const row = { providerSlug: "market:xflow", basis: "market_estimate", partial: true } as PriceRow;
    const result = attachMarketPricingEvidence(coverage, "INR", [row], [], [fee]);
    expect(result.providers[0]?.pricingStatus?.label).toBe("Market estimate above");
    expect(result.providers[0]?.pricingStatus?.reason).toContain("unconfirmed");
  });
});
