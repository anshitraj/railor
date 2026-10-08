import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdapter } from "../adapters.js";
import { comparePrices } from "../pricing.js";

const xflow = getAdapter("xflow")!;
const dlocal = getAdapter("dlocal")!;
const india = { sourceAsset: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 100 };

afterEach(() => vi.unstubAllGlobals());

describe("Xflow read-only quote adapter", () => {
  it("refuses a wrong-mode key and a non-India route before any request", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    await expect(xflow.getQuote!({ apiKey: "sk_test_example", environment: "production" }, india)).rejects.toThrow(/sk_live_/);
    await expect(xflow.getQuote!({ apiKey: "sk_live_example", environment: "production" }, { ...india, destinationCurrency: "BRL", destinationCountry: "BR" })).rejects.toThrow(/India/);
    expect(network).not.toHaveBeenCalled();
  });

  it("sends the documented payout_fx request, scopes a platform account and marks missing fees", async () => {
    const network = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ type: "payout_fx", sell: { amount: "100.00", currency: "USD" }, buy: { amount: "8253.63", currency: "INR" }, rate: { user: "82.5363", valid_to: Math.floor(Date.now() / 1000) + 600 } }));
    vi.stubGlobal("fetch", network);
    const quote = await xflow.getQuote!({ apiKey: "sk_live_example", environment: "production", accountId: "acct_1" }, india);
    const [url, init] = network.mock.calls[0]!;
    const params = new URL(String(url)).searchParams;
    expect(params.get("sell.amount")).toBe("100");
    expect(params.get("buy.currency")).toBe("INR");
    expect(params.get("type")).toBe("payout_fx");
    expect(new Headers(init.headers).get("Xflow-Account")).toBe("acct_1");
    expect(quote).toMatchObject({ recipientAmount: 8253.63, exchangeRate: "82.5363", costPartial: true, accountContext: "customer_connected" });
    expect(quote.feeAmount).toBeUndefined();
  });

  it("rejects a successful HTTP response for the wrong amount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "payout_fx", sell: { amount: "200", currency: "USD" }, buy: { amount: "100", currency: "INR" }, rate: { user: "1" } })));
    await expect(xflow.getQuote!({ apiKey: "sk_test_example", environment: "sandbox" }, india)).rejects.toThrow(/different amount/);
  });
});

describe("dLocal Payouts v3 quote adapter", () => {
  it("requires a USD-funded country route before OAuth", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    await expect(dlocal.getQuote!({ clientId: "id", clientSecret: "secret" }, { ...india, sourceAsset: "EUR" })).rejects.toThrow(/USD-funded/);
    await expect(dlocal.getQuote!({ clientId: "id", clientSecret: "secret" }, { ...india, destinationCountry: undefined })).rejects.toThrow(/destination country/);
    expect(network).not.toHaveBeenCalled();
  });

  it("authenticates with OAuth and keeps fees plus tax separate from the fixed send budget", async () => {
    const network = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "temporary-token", expires_in: 180, scope: "payouts" });
      return Response.json({ status: "0", quote_id: "quote-private", expiration_time: new Date(Date.now() + 60000).toISOString(), detail: { source_amount: 100, source_currency: "USD", destination_amount: 8300, destination_currency: "INR", exchange_rate: 83 }, fee: { fee_amount: 1.6, fee_currency: "USD" }, tax: { tax_amount: 0.09, tax_currency: "USD" }, debit: { debit_amount: 101.69, debit_currency: "USD" } });
    });
    vi.stubGlobal("fetch", network);
    const quote = await dlocal.getQuote!({ clientId: "id-one", clientSecret: "secret-one", environment: "sandbox" }, india);
    const [tokenUrl, tokenInit] = network.mock.calls[0]!;
    const [quoteUrl, quoteInit] = network.mock.calls[1]!;
    expect(tokenUrl).toBe("https://sandbox.dlocal.com/oauth/token");
    expect(JSON.parse(String(tokenInit.body))).toMatchObject({ grant_type: "client_credentials", client_id: "id-one" });
    expect(quoteUrl).toBe("https://sandbox.dlocal.com/payouts/v3/quote");
    expect(quoteInit.headers).toMatchObject({ Authorization: "Bearer temporary-token", "X-Version": "3.0" });
    expect(JSON.parse(String(quoteInit.body))).toEqual({ country: "IN", source_currency: "USD", destination_currency: "INR", source_amount: 100 });
    expect(quote).toMatchObject({ recipientAmount: 8300, feeAmount: 1.6900000000000002, feeCurrency: "USD", costPartial: true });
    expect(quote.costNote).toContain("101.69 USD");
  });

  it("accepts the newer documented id/details envelope but rejects missing quote identity", async () => {
    const { dlocalQuoteToUnified } = await import("../payments/adapters/dlocal.js");
    expect(dlocalQuoteToUnified({ id: "new-id", details: { source_amount: 100, source_currency: "USD", destination_amount: 392.72, destination_currency: "INR" } }, india).providerQuoteId).toBe("new-id");
    expect(() => dlocalQuoteToUnified({ details: { source_amount: 100, source_currency: "USD", destination_amount: 392.72, destination_currency: "INR" } }, india)).toThrow(/quote ID/);
  });
});

it("never presents an expired connected quote as a current price", async () => {
  const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 100 }, {
    fetcher: async () => new Response("{}", { status: 503 }),
    now: new Date("2026-10-08T10:00:00Z"),
    connectedQuotes: async () => [{ providerSlug: "xflow", providerName: "Xflow", quote: {
      providerSlug: "xflow", sourceAsset: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 100,
      recipientAmount: 8300, costPartial: true, quoteType: "live", accountContext: "customer_connected",
      verificationType: "provider_reported", observedAt: "2026-10-08T09:59:00Z", quotedAt: "2026-10-08T09:59:00Z", expiresAt: "2026-10-08T09:59:30Z",
    } }],
  });
  expect(result.rows.find(row => row.providerSlug === "xflow")).toBeUndefined();
  expect(result.unavailable.find(row => row.providerSlug === "xflow")?.reason).toMatch(/expired/);
});
