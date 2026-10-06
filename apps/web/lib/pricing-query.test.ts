import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./connections", () => ({ getConnectionCredentials: vi.fn() }));
vi.mock("./reference", () => ({ getIntentOptions: vi.fn() }));
vi.mock("./platform-pricing", () => ({ getPlatformQuoteCheck: vi.fn() }));
vi.mock("./provider-market", () => ({ providerMarketCoverage: vi.fn() }));
const { parsePriceQuery } = await import("./pricing");

describe("price query customer context", () => {
  const base = { from: "usd", to: "inr", amount: "1000", market: "1" };
  const context = { profile: "sole_proprietor", country: "IN", direction: "receive", purpose: "services" };
  it("retains profile, legal form, country, direction and purpose through a shareable query", () => {
    expect(parsePriceQuery(new URLSearchParams({ ...base, ...context }))).toMatchObject({ sourceCurrency: "USD", destinationCurrency: "INR", context });
  });
  it("rejects partial, invented and invalid context instead of silently quoting the wrong product", () => {
    expect(parsePriceQuery({ ...base, profile: "business" })).toBeNull();
    expect(parsePriceQuery({ ...base, ...context, profile: "individual" })).toBeNull();
    expect(parsePriceQuery({ ...base, ...context, country: "India" })).toBeNull();
    expect(parsePriceQuery({ ...base, ...context, direction: "payout" })).toBeNull();
    expect(parsePriceQuery({ ...base, ...context, purpose: "investment" })).toBeNull();
  });
  it("preserves existing API callers that don't supply a profile", () => {
    expect(parsePriceQuery(base)).toEqual({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true });
  });
});
