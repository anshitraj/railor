import { afterEach, describe, expect, it, vi } from "vitest";
import { assessCustomerProfile, CustomerContext } from "../customer-profiles.js";
import { comparePrices } from "../pricing.js";

const context: CustomerContext = { profile: "business", country: "IN", direction: "receive", purpose: "services" };
afterEach(() => vi.unstubAllGlobals());
const request = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, amountUsd: 1000, referenceRate: 90 };
const assess = (slug = "wise", overrides: Partial<CustomerContext> = {}, amounts: Partial<typeof request> = {}) => assessCustomerProfile(slug, { ...context, ...overrides }, { ...request, ...amounts });

describe("account-holder product eligibility", () => {
  it("does not apply commercial receiving evidence to personal accounts", () => {
    expect(CustomerContext.parse({ ...context, profile: "personal", purpose: "personal" }).profile).toBe("personal");
    for (const provider of ["wise", "skydo"]) expect(assess(provider, { profile: "personal" })).toMatchObject({ status: "unconfirmed", priceApplicable: false });
  });
  it("changes bank-name and document requirements for an individual freelancer, registered sole proprietor and company", () => {
    const freelance = assess("wise", { profile: "freelancer" });
    const sole = assess("wise", { profile: "sole_proprietor" });
    const company = assess();
    expect(freelance.verification.join()).toContain("personal name");
    expect(sole.verification.join()).toContain("trading name");
    expect(company.verification.join()).toContain("owner/director");
    expect(new Set([freelance.documents.join(), sole.documents.join(), company.documents.join()]).size).toBe(3);
    expect(freelance.fees).toBe(sole.fees); // No fictional freelancer discount.
  });
  it("uses the narrower documented freelance currency set", () => {
    expect(assess("wise", {}, { sourceCurrency: "CHF" }).status).toBe("documented");
    expect(assess("wise", { profile: "freelancer" }, { sourceCurrency: "CHF" }).status).toBe("unconfirmed");
    expect(assess("wise", { profile: "sole_proprietor" }, { sourceCurrency: "CHF" }).status).toBe("unconfirmed");
    expect(assess("wise", { profile: "freelancer" }, { sourceCurrency: "BRL" }).status).toBe("not_supported");
  });
  it("enforces receiving limits in their own currency units", () => {
    expect(assess("wise", {}, { amountUsd: 4.99 }).status).toBe("not_supported");
    expect(assess("wise", {}, { amountUsd: 5 }).status).toBe("documented");
    expect(assess("wise", {}, { amount: 30_000, amountUsd: 30_000 }).status).toBe("not_supported");
    expect(assess().limits).toContain("2,500,000");
  });
  it("does not infer support for salaries, personal transfers, other countries or outgoing transfers", () => {
    for (const change of [{ purpose: "salary" }, { purpose: "personal" }, { purpose: "goods" }, { country: "GB" }, { direction: "send" }] as Partial<CustomerContext>[]) expect(assess("wise", change).status).toBe("unconfirmed");
    expect(assess("market:remitly").status).toBe("unconfirmed");
    expect(assess("revolut").priceApplicable).toBe(false);
  });
  it("retains unknown Skydo limits and requires SWIFT confirmation outside documented local currencies", () => {
    expect(assess("skydo").limits).toContain("not been verified");
    expect(assess("skydo", { profile: "freelancer" }).verification.join()).toContain("Personal PAN");
    expect(assess("skydo", {}, { sourceCurrency: "JPY" })).toMatchObject({ status: "unconfirmed", priceApplicable: false });
    expect(assess("skydo", {}, { destinationCurrency: "EUR" }).status).toBe("not_supported");
  });
});

const publicBody = { id: "q", sourceAmount: 1000, sourceCurrency: "USD", targetCurrency: "INR", rate: 90, expirationTime: "2026-10-07T12:00:00Z", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1000, targetAmount: 89550, fee: { total: 5 } }] };
const fetcher: typeof fetch = async (url) => {
  if (String(url).includes("revolut.com")) return new Response("{}", { status: 503 });
  if (String(url).includes("/v4/comparisons")) return Response.json({ providers: [{ alias: "remitly", name: "Remitly", quotes: [{ receivedAmount: 91000, rate: 91, fee: 0 }] }] });
  return Response.json(publicBody);
};
describe("profile-aware price comparisons", () => {
  it("does not contaminate shared public observations with a previous customer's profile", async () => {
    const network = vi.fn(fetcher);
    vi.stubGlobal("fetch", network);
    const input = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true };
    const commercial = await comparePrices({ ...input, context });
    const consumer = await comparePrices(input);
    expect(commercial.rows.find((r) => r.providerSlug === "market:remitly")?.partial).toBe(true);
    expect(consumer.rows.find((r) => r.providerSlug === "market:remitly")).toMatchObject({ partial: false });
    expect(consumer.rows.find((r) => r.providerSlug === "market:remitly")?.profileAssessment).toBeUndefined();
    expect(network.mock.calls.filter(([url]) => String(url).includes("/v4/comparisons"))).toHaveLength(1);
  });
  it("allows a recipient-owned quote dependency without promoting unrelated public products", async () => {
    const connectedQuotes = vi.fn(async () => []);
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true, context }, { fetcher, connectedQuotes });
    expect(connectedQuotes).toHaveBeenCalledOnce();
    expect(result.rows.find((r) => r.providerSlug === "wise")).toMatchObject({ partial: true, totalCostPct: null, shortfall: null, profileAssessment: { status: "documented", priceApplicable: false } });
    expect(result.rows.find((r) => r.providerSlug === "market:remitly")).toMatchObject({ partial: true, shortfall: null, profileAssessment: { status: "unconfirmed" } });
    expect(result.rows.find((r) => r.shortfall === 0)?.providerSlug).toBe("skydo");
  });
  it("does not give market estimates a best-price baseline when public sources fail", async () => {
    const onlyMarket: typeof fetch = async (url) => String(url).includes("/v4/comparisons") ? Response.json({ providers: [{ alias: "bank", name: "Bank", quotes: [{ receivedAmount: 100, fee: 0 }] }] }) : new Response("{}", { status: 503 });
    const result = await comparePrices({ sourceCurrency: "EUR", destinationCurrency: "AUD", amount: 100, includeMarket: true }, { fetcher: onlyMarket });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.shortfall).toBeNull();
  });
  it("rejects invalid context before provider requests", async () => {
    const network = vi.fn(fetcher);
    await expect(comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 100, context: { ...context, profile: "individual" } as unknown as CustomerContext }, { fetcher: network })).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});
