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
    expect(providers).toEqual(expect.arrayContaining(["eand-money", "al-ansari-exchange", "wio"]));
    // Careem's FAQ lists the US, but its UAE-to-US product isn't confirmed, so it is not matched.
    expect(providers).not.toContain("careem-pay");
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
  it("checks Indian bank wire coverage using the requested funding method", () => {
    const input = request("USD", "INR", "IN", "personal", "receive");
    const wire = { ...input, context: { ...input.context!, paymentMethod: "wire" as const } };
    expect(matched(wire)).toEqual(expect.arrayContaining(["hdfc-bank", "idfc-first-bank", "canara-bank", "state-bank-of-india"]));
    expect(matched({ ...wire, context: { ...wire.context, paymentMethod: "local_bank" } })).not.toContain("hdfc-bank");
  });
  it("finds the US-to-Ghana providers without inferring Ghana-to-US coverage", () => {
    const providers = ["lemfi", "sendwave", "nala"];
    expect(matched(request("USD", "GHS", "US"))).toEqual(expect.arrayContaining(providers));
    expect(matched(request("GHS", "USD", "GH")).filter(slug => providers.includes(slug))).toEqual([]);
    expect(matched(request("USD", "GHS", "US", "business"))).toEqual([]);
  });
  it("makes discovery providers searchable without inventing numeric prices or erasing official limitations", () => {
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
