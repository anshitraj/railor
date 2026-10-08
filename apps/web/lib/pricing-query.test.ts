import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ options: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./connections", () => ({ getConnectionCredentials: vi.fn() }));
vi.mock("./reference", () => ({ getIntentOptions: mocks.options }));
vi.mock("./platform-pricing", () => ({ getPlatformQuoteChecks: vi.fn(async () => []) }));
vi.mock("./provider-market", () => ({ providerMarketCoverage: vi.fn() }));
const { parsePriceQuery, loadPricePage } = await import("./pricing");

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
  it("retains a personal account without reclassifying it as commercial", () => {
    expect(parsePriceQuery({ ...base, ...context, profile: "personal", purpose: "personal" })?.context).toMatchObject({ profile: "personal", purpose: "personal" });
  });
});

describe("onboarding price defaults", () => {
  it("uses the saved profile and lets an explicit comparison override it", async () => {
    mocks.options.mockResolvedValue({ currencies: [{ value: "USD", label: "USD" }], currencyByCountry: { IN: "INR" } });
    // Equal currencies avoid a provider request while testing page initialization.
    const personal = await loadPricePage({ from: "USD", to: "USD" }, null, "IN", "personal");
    expect(personal.initial.context).toEqual({ profile: "personal", country: "IN", direction: "send", purpose: "personal" });
    const freelance = await loadPricePage({ from: "USD", to: "USD" }, null, "IN", "freelancer");
    expect(freelance.initial.context.profile).toBe("freelancer");
    const shared = await loadPricePage({ from: "USD", to: "USD", profile: "business", purpose: "services" }, null, "IN", "personal");
    expect(shared.initial.context).toMatchObject({ profile: "business", purpose: "services" });
  });
});
