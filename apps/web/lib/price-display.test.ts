import { describe, expect, it } from "vitest";
import type { PriceCheckInput, PriceRow } from "@railor/core";
import { freshComparison, providerIdentity } from "./price-display";
const input: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, context: { profile: "personal", direction: "receive", country: "IN", purpose: "personal" } };
const now = Date.parse("2026-10-30T00:00:00Z");
const row = { providerSlug: "market:remitly", basis: "market_estimate", partial: false, costComplete: true, observedAt: "2026-10-29T21:00:00Z", publicComparison: { amount: 1000, sourceCurrency: "USD", destinationCurrency: "INR", sourceCountry: "US", destinationCountry: "IN", freshUntil: "2026-10-30T21:00:00Z" } } as PriceRow;
describe("fresh public comparison display", () => {
  it("includes a recent personal reference and keeps one provider identity", () => {
    expect(freshComparison(row, input, now)).toBe(true);
    expect(providerIdentity("market:remitly")).toBe(providerIdentity("remitly"));
  });
  it("expires at 24 hours and rejects future or missing collection times", () => {
    expect(freshComparison(row, input, Date.parse(row.publicComparison!.freshUntil))).toBe(false);
    expect(freshComparison({ ...row, observedAt: "" }, input, now)).toBe(false);
    expect(freshComparison({ ...row, observedAt: "2026-10-31T00:00:00Z" }, input, now)).toBe(false);
  });
  it("does not pass consumer observations off as commercial prices", () => {
    for (const profile of ["business", "freelancer", "sole_proprietor"] as const) expect(freshComparison(row, { ...input, context: { ...input.context!, profile } }, now)).toBe(false);
    expect(freshComparison(row, { ...input, context: { ...input.context!, purpose: "services" } }, now)).toBe(false);
  });
  it("rejects different sender countries, destinations and amounts", () => {
    const send = { ...input, context: { ...input.context!, direction: "send" as const, country: "US" } };
    expect(freshComparison(row, send, now)).toBe(true);
    expect(freshComparison(row, { ...send, context: { ...send.context!, country: "CA" } }, now)).toBe(false);
    expect(freshComparison(row, { ...input, amount: 2000 }, now)).toBe(false);
    expect(freshComparison(row, { ...input, destinationCountry: "GB" }, now)).toBe(false);
    expect(freshComparison({ ...row, publicComparison: { ...row.publicComparison!, destinationCountry: null } }, input, now)).toBe(false);
  });
  it("keeps partial costs and contradicted sources out of fresh provider prices", () => {
    expect(freshComparison({ ...row, partial: true }, input, now)).toBe(false);
    expect(freshComparison({ ...row, webChecks: [{ state: "contradicted" }] as PriceRow["webChecks"] }, input, now)).toBe(false);
  });
});
