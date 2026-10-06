import { describe, expect, it } from "vitest";
import { agentPreference, draftPaymentIntent } from "../agent.js";

describe("reviewable Agent intents", () => {
  it("reads the complete Singapore to Mexico request without inventing financial facts", () => {
    const result = draftPaymentIntent("I need to send $100k USDC on Base from our Singapore company to a Mexican supplier receiving MXN through SPEI. Reliability matters more than price.");
    expect(result.valid).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.draft).toMatchObject({ sourceEntityCountry: "SG", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "MX", destinationCurrency: "MXN", namedRail: "SPEI", amount: 100000, preference: "most_reliable" });
    expect(result.draft).not.toHaveProperty("amountCurrency");
    expect(result.draft).not.toHaveProperty("paymentMethod");
  });
  it("requires a missing network rather than assuming Base", () => {
    const result = draftPaymentIntent("Send 100 USDC from our SG company to MX receiving MXN through SPEI");
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("sourceNetwork");
    expect(result.draft.sourceNetwork).toBeUndefined();
  });
  it("does not turn the pronoun us into a sending jurisdiction", () => {
    const result = draftPaymentIntent("Show us a way to send 1000 USDC on Base to Mexico receiving MXN", "SG");
    expect(result.draft.sourceEntityCountry).toBe("SG");
    expect(result.notes).toContain("Entity country came from your workspace profile.");
  });
  it("keeps an explicitly written US country code", () => {
    const result = draftPaymentIntent("Send 1000 USD from our US company to MX receiving MXN");
    expect(result.draft).toMatchObject({ sourceEntityCountry: "US", destinationCountry: "MX" });
  });
  it("does not match lowercase pronouns just because an uppercase US also appears", () => {
    const result = draftPaymentIntent("Show us how our Singapore company can send 1000 USD to US receiving USD");
    expect(result.draft).toMatchObject({ sourceEntityCountry: "SG", destinationCountry: "US" });
  });
  it("marks inferred receiving values for explicit confirmation", () => {
    const result = draftPaymentIntent("Send $1k USDC on Base to a Mexican supplier", "SG");
    expect(result.valid).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.inferredFields).toContainEqual({ field: "destinationCurrency", value: "MXN" });
    expect(result.notes).toContain("Entity country came from your workspace profile.");
  });
  it("does not treat the M in MXN as a million multiplier", () => {
    expect(draftPaymentIntent("Send 100 MXN from SG to Germany receiving EUR").draft.amount).toBe(100);
  });
  it.each([["$1k", 1000], ["$0.50", .5], ["2 million", 2000000], ["100,000.25", 100000.25]])("reads %s", (value, expected) => {
    expect(draftPaymentIntent(`Send ${value} USDC on Base from Singapore to Mexico receiving MXN`).draft.amount).toBe(expected);
  });
  it("keeps an explicitly stated fiat amount as funding, not receiving", () => {
    const result = draftPaymentIntent("Send 100 USD from SG to MX");
    expect(result.draft).toMatchObject({ amount: 100, sourceCurrency: "USD", amountCurrency: "USD", destinationCurrency: "MXN" });
    expect(result.needsReview).toBe(true);
  });
  it("rejects missing or negative amounts", () => {
    for (const amount of ["", "-100"]) expect(draftPaymentIntent(`Send ${amount} USDC on Base from Singapore to Mexico receiving MXN`).missing).toContain("amount");
  });
  it("never turns unknown funding into a silent stablecoin default", () => {
    const result = draftPaymentIntent("Pay our Mexican supplier 1000", "SG");
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("sourceAsset or sourceCurrency");
  });
  it("accepts reversed priorities and leaves unstated preference balanced", () => {
    expect(agentPreference("Price matters more than reliability")).toBe("cheapest");
    expect(agentPreference("Reliability matters more than price")).toBe("most_reliable");
    expect(agentPreference("Show available providers")).toBeNull();
  });
});
