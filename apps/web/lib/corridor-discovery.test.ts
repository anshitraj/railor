import { describe, expect, it } from "vitest";
import type { PriceCheckInput } from "@railor/core";
import { discoveredCoverage, DISCOVERED_PROVIDERS } from "./corridor-discovery";
import { providerMarketCoverage } from "./provider-market";
import { attachMarketPricingEvidence } from "./market-pricing-evidence";

const request = (from: string, to: string, country: string, profile: "personal" | "business" = "personal", direction: "send" | "receive" = "send"): PriceCheckInput => ({ sourceCurrency: from, destinationCurrency: to, amount: 1000, context: { profile, country, direction, purpose: "personal" } });
const matched = (input: PriceCheckInput) => discoveredCoverage(input).filter(provider => provider.routeMatch).map(provider => provider.providerSlug);

describe("directional community provider discovery", () => {
  it("matches personal UAE to India products without converting them into business routes", () => {
    expect(matched(request("AED", "INR", "AE"))).toEqual(expect.arrayContaining(["careem-pay", "botim", "aspora", "eand-money", "al-ansari-exchange", "lulu-exchange", "taptap-send"]));
    expect(matched(request("AED", "INR", "AE", "business"))).toEqual([]);
  });
  it("does not infer US payout support from Indian payout support", () => {
    const providers = matched(request("AED", "USD", "AE"));
    expect(providers).toEqual(expect.arrayContaining(["careem-pay", "eand-money", "al-ansari-exchange", "wio"]));
    expect(providers).not.toContain("botim");
    expect(providers).not.toContain("aspora");
  });
  it("keeps Mexico's unconfirmed product separate and never infers the reverse route", () => {
    expect(matched(request("MXN", "USD", "MX"))).toEqual(["arq"]);
    expect(matched(request("MXN", "USD", "MX", "business"))).toEqual(["arq"]);
    expect(matched(request("USD", "MXN", "US"))).not.toContain("arq");
    expect(matched(request("INR", "AED", "IN"))).toEqual([]);
  });
  it("checks sender country or recipient country according to the request", () => {
    expect(matched(request("AED", "INR", "US"))).toEqual([]);
    expect(matched(request("AED", "INR", "IN", "personal", "receive"))).toContain("botim");
    expect(matched({ ...request("AED", "INR", "AE"), destinationCountry: "US" })).toEqual([]);
    expect(matched({ sourceCurrency: "AED", destinationCurrency: "INR", amount: 1000 })).toEqual([]);
  });
  it("makes all twelve searchable without inventing numeric prices or erasing official limitations", () => {
    const coverage = providerMarketCoverage(request("AED", "INR", "AE"));
    expect(coverage.totalTracked).toBeGreaterThanOrEqual(112);
    expect(new Set(coverage.allProviders?.map(provider => provider.providerSlug)).size).toBe(coverage.totalTracked);
    for (const provider of DISCOVERED_PROVIDERS) expect(coverage.allProviders?.find(item => item.providerSlug === provider.slug)).toBeDefined();
    const enriched = attachMarketPricingEvidence(coverage, "INR", [], [], []);
    const botim = enriched.providers.find(provider => provider.providerSlug === "botim");
    expect(botim?.pricingStatus?.reason).toContain("Emirates ID");
    expect(botim).not.toHaveProperty("recipientAmount");
    expect(botim?.discoverySources?.length).toBeGreaterThan(0);
  });
});
