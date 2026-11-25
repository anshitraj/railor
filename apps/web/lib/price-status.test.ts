import { describe, expect, it } from "vitest";
import type { PriceRow } from "@railor/core";
import { priceCollectedLabel, priceStatus } from "./price-display";
import { providerLink } from "./provider-sites";

const row = (over: Partial<PriceRow>): PriceRow => ({
  providerSlug: "wise", providerName: "Wise", basis: "live_public", recipientAmount: 92_000, feeAmount: 5, feeCurrency: "USD", rate: 92.5,
  totalCostPct: 0.5, partial: false, costComplete: true, delivery: null, observedAt: "2026-11-25T18:05:00Z", source: { label: "wise.com", url: "https://wise.com" }, notes: [], ...over,
});

describe("priceStatus", () => {
  it("calls a complete live price comparable", () => {
    expect(priceStatus(row({}))).toMatchObject({ kind: "comparable", label: "Comparable price" });
  });
  it("marks first-transfer offers", () => {
    expect(priceStatus(row({ publicOffer: { kind: "first_transfer", fundingMethod: "bank transfer", payoutMethod: "bank deposit", displayUntil: "2026-11-26T00:00:00Z" } }))).toMatchObject({ kind: "offer" });
  });
  it("asks to confirm estimates, partial prices and missing inputs, and says why", () => {
    expect(priceStatus(row({ basis: "market_estimate" }))).toMatchObject({ kind: "confirm", reason: expect.stringContaining("estimate") });
    expect(priceStatus(row({ partial: true, missing: ["Route availability"] }))).toMatchObject({ kind: "confirm", reason: "Route availability" });
    expect(priceStatus(row({ costComplete: false }))).toMatchObject({ kind: "confirm" });
  });
  it("says when the price was collected, or that the schedule is from a date", () => {
    expect(priceCollectedLabel(row({}))).toBe("Collected 25 Nov, 18:05 UTC");
    expect(priceCollectedLabel(row({ basis: "published", observedAt: "2026-11-03T00:00:00Z" }))).toBe("Fee schedule from 3 Nov");
    expect(priceCollectedLabel(row({ observedAt: "" }))).toBe("Time not given by source");
  });
});

describe("providerLink", () => {
  it("opens Wise with the pair and amount, Remitly and Xoom on the US-India route, others at home", () => {
    expect(providerLink("wise", { from: "USD", to: "INR", amount: 1000 })).toEqual({ href: "https://wise.com/gb/currency-converter/usd-to-inr-rate?amount=1000", carries: "amount" });
    expect(providerLink("market:remitly", { from: "USD", to: "INR", amount: 1000 })).toMatchObject({ carries: "corridor" });
    expect(providerLink("remitly", { from: "GBP", to: "INR", amount: 1000 })).toEqual({ href: "https://www.remitly.com", carries: "home" });
    expect(providerLink("unknown-provider", { from: "USD", to: "INR", amount: 1 })).toBeNull();
  });
});
