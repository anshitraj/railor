import { describe, expect, it } from "vitest";
import { priceDestination } from "./price-destination";

describe("price comparison destination", () => {
  const currencies = { IN: "INR", MX: "MXN", DE: "EUR", FR: "EUR", US: "USD", EC: "USD" };
  const input = { sourceCurrency: "USD", destinationCurrency: "MXN", amount: 1000 };
  it("automatically exposes country-specific fees for unique payout currencies", () => {
    expect(priceDestination(input, currencies)).toBe("MX");
    expect(priceDestination({ ...input, destinationCurrency: "INR" }, currencies)).toBe("IN");
  });
  it("does not guess a country for shared currencies or unknown currencies", () => {
    expect(priceDestination({ ...input, destinationCurrency: "EUR" }, currencies)).toBeUndefined();
    expect(priceDestination({ ...input, destinationCurrency: "USD" }, currencies)).toBeUndefined();
    expect(priceDestination({ ...input, destinationCurrency: "ZZZ" }, currencies)).toBeUndefined();
  });
  it("respects the chosen country and a matching receiving profile", () => {
    expect(priceDestination({ ...input, destinationCountry: "mx" }, currencies)).toBe("MX");
    const context = { country: "FR", profile: "business" as const, direction: "receive" as const, purpose: "services" as const };
    expect(priceDestination({ ...input, destinationCurrency: "EUR", context }, currencies)).toBe("FR");
    expect(priceDestination({ ...input, destinationCurrency: "EUR", context: { ...context, direction: "send" } }, currencies)).toBeUndefined();
  });
});
