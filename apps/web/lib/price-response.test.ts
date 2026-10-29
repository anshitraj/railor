import { describe, expect, it } from "vitest";
import type { PriceCheckResult } from "@railor/core";
import { priceResponseMatches } from "./price-response";
const request = { from: "USD", to: "INR", amount: 1000, market: true, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services" } } as const;
const result = { input: { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true, context: { purpose: "services", direction: "receive", country: "IN", profile: "freelancer" } } } as PriceCheckResult;
describe("price response identity", () => {
  it("accepts the same request regardless of object-key order", () => { expect(priceResponseMatches(result, request)).toBe(true); });
  it("rejects previous amounts and swapped or different currency pairs", () => {
    for (const patch of [{ amount: 2000 }, { from: "INR", to: "USD" }, { to: "AED" }]) expect(priceResponseMatches(result, { ...request, ...patch })).toBe(false);
  });
  it("rejects stale profile, direction, purpose, country and market responses", () => {
    expect(priceResponseMatches(result, { ...request, market: false })).toBe(false);
    for (const context of [{ ...request.context, profile: "business" as const }, { ...request.context, direction: "send" as const }, { ...request.context, purpose: "goods" as const }, { ...request.context, country: "GB" }]) expect(priceResponseMatches(result, { ...request, context })).toBe(false);
  });
  it("rejects absent data and non-finite or non-positive amounts", () => {
    expect(priceResponseMatches(null, request)).toBe(false);
    for (const amount of [NaN, Infinity, 0, -1]) expect(priceResponseMatches(result, { ...request, amount })).toBe(false);
  });
});
