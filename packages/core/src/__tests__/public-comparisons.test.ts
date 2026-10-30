import { describe, expect, it } from "vitest";
import { comparisonRows, type ComparisonFeed } from "../public-pricing/comparisons.js";
const input = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 };
const feed: ComparisonFeed = { amount: 1000, sourceCurrency: "USD", targetCurrency: "INR", providers: [{ alias: "remitly", name: "Remitly", quotes: [{ rate: 95.1, fee: 0, receivedAmount: 95100, dateCollected: "2026-10-29T21:00:00Z", sourceCountry: "US", targetCountry: "IN" }] }] };
describe("public comparison observations", () => {
  it("preserves the observed amount, origin, date and conditional source", () => {
    expect(comparisonRows(input, feed)[0]).toMatchObject({ basis: "market_estimate", providerSlug: "market:remitly", recipientAmount: 95100, feeAmount: 0, partial: false,
      observedAt: "2026-10-29T21:00:00.000Z", publicComparison: { amount: 1000, sourceCountry: "US", destinationCountry: "IN", freshUntil: "2026-10-30T21:00:00.000Z" } });
  });
  it("rejects another amount or currency pair instead of rescaling it", () => {
    for (const patch of [{ amount: 2000 }, { sourceCurrency: "EUR" }, { targetCurrency: "AED" }]) expect(comparisonRows(input, { ...feed, ...patch })).toEqual([]);
  });
  it("does not mark missing timestamps or unverified amounts as fresh", () => {
    expect(comparisonRows(input, { providers: feed.providers })[0]?.publicComparison).toBeUndefined();
    const providers = [{ alias: "sample", quotes: [{ rate: 95, fee: 0, receivedAmount: 95000 }] }];
    expect(comparisonRows(input, { ...feed, providers })[0]).toMatchObject({ observedAt: "", partial: false });
    expect(comparisonRows(input, { ...feed, providers })[0]?.publicComparison).toBeUndefined();
    expect(comparisonRows(input, { ...feed, providers: [{ alias: "dated", quotes: [{ ...providers[0]!.quotes[0], dateCollected: "2026-10-29" }] }] })[0]?.publicComparison).toBeUndefined();
  });
  it("does not call missing fees, invalid amounts or inconsistent arithmetic complete", () => {
    for (const quote of [{ rate: 95, receivedAmount: 95000 }, { rate: 95, receivedAmount: 95000, fee: -1 }, { rate: 95, receivedAmount: 95000, fee: 25 }]) {
      const row = comparisonRows(input, { ...feed, providers: [{ alias: "sample", quotes: [quote] }] })[0];
      expect(row?.partial).toBe(true); expect(row?.publicComparison).toBeUndefined();
    }
    for (const receivedAmount of [NaN, Infinity, -10, 0]) expect(comparisonRows(input, { ...feed, providers: [{ alias: "sample", quotes: [{ rate: 95, receivedAmount }] }] })).toEqual([]);
  });
});
