import { describe, expect, it } from "vitest";
import {
  buildMarketDiscoveryQueries,
  discoverMarket,
  validateMarketCandidates,
  type DiscoverySourceInput,
} from "../market-discovery.js";

const sources: DiscoverySourceInput[] = [
  {
    title: "Provider A pricing",
    url: "https://provider-a.example/pricing",
    publishedAt: "2026-09-20",
    content: "Provider A supports INR to AED business payments. The conversion fee is 1.5% and settlement completes within one business day.",
  },
  {
    title: "Provider B launch",
    url: "https://provider-b.example/launch",
    publishedAt: "2026-09-21",
    content: "Provider B launched INR to AED payouts. Customers pay a 2 percent transfer fee.",
  },
];

describe("market discovery", () => {
  it("builds direction-specific queries", () => {
    const queries = buildMarketDiscoveryQueries({
      customerType: "business",
      sourceCurrency: "INR",
      destinationCurrency: "AED",
      destinationCountry: "AE",
    });
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.includes("INR") && query.includes("AED"))).toBe(true);
  });

  it("drops claims whose purported evidence is not present in a fetched source", () => {
    const candidates = validateMarketCandidates({
      candidates: [{
        name: "Imaginary Rail",
        category: "payment_rail",
        routeSummary: "Claims instant settlement.",
        pricingSummary: "0%",
        feePercent: 0,
        speedSummary: "Instant",
        whyConsider: [],
        limitations: [],
        evidence: [{ sourceId: 0, quote: "This sentence was never in the source material." }],
      }],
    }, sources);
    expect(candidates).toEqual([]);
  });

  it("only accepts a percentage when the cited text identifies it as a cost", () => {
    const candidates = validateMarketCandidates({
      candidates: [{
        name: "Provider A",
        category: "provider",
        routeSummary: "INR to AED business payments.",
        pricingSummary: "1.5% conversion fee",
        feePercent: 1.5,
        speedSummary: "Within one business day",
        whyConsider: ["Published route and fee"],
        limitations: [],
        evidence: [{ sourceId: 0, quote: "The conversion fee is 1.5% and settlement completes within one business day." }],
      }],
    }, sources);
    expect(candidates[0]?.feePercent).toBe(1.5);
    expect(candidates[0]?.status).toBe("research_required");
  });

  it("does not mistake different fee components for comparable all-in prices", async () => {
    const result = await discoverMarket(
      { customerType: "business", sourceCurrency: "INR", destinationCurrency: "AED", destinationCountry: "AE" },
      {
        now: () => new Date("2026-09-23T00:00:00.000Z"),
        search: async () => sources,
        generate: async () => ({
          candidates: [
            {
              name: "Provider A", category: "provider", routeSummary: "Supports INR to AED business payments.",
              pricingSummary: "1.5% conversion fee", feePercent: 1.5, speedSummary: "One business day",
              whyConsider: ["Lower cited percentage"], limitations: [],
              evidence: [{ sourceId: 0, quote: "The conversion fee is 1.5% and settlement completes within one business day." }],
            },
            {
              name: "Provider B", category: "provider", routeSummary: "Launched INR to AED payouts.",
              pricingSummary: "2% transfer fee", feePercent: 2, speedSummary: null,
              whyConsider: ["New route"], limitations: [],
              evidence: [{ sourceId: 1, quote: "Customers pay a 2 percent transfer fee." }],
            },
          ],
        }),
      },
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.recommendation).toMatchObject({ candidateName: "Provider A", basis: "best_evidenced" });
    expect(result.expiresAt).toBe("2026-09-23T01:00:00.000Z");
  });
});
