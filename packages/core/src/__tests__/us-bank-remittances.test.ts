import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";
import { usBankRemittanceRows } from "../public-pricing/us-bank-remittances.js";

const now = new Date("2026-11-19T20:00:00Z");
const input: PriceCheckInput = {
  sourceCurrency: "USD", destinationCurrency: "SGD", destinationCountry: "SG", amount: 1000,
  context: { country: "IN", profile: "personal", direction: "receive", purpose: "personal", paymentMethod: "local_bank" },
};
const money = (amount: string, currencyCode: string) => ({ rawValue: amount, currencyCode });

function providerFetch(destinationCountry = "SG", method = "ACH") {
  return vi.fn<typeof fetch>(async (url, options) => {
    if (String(url).startsWith("https://www.xoom.com/singapore/")) {
      return new Response(null, { headers: { "set-cookie": "CSRF=guest-session; Secure; Path=/" } });
    }
    if (String(url).endsWith("/wapi/guest-app/remittance")) {
      expect(new Headers(options?.headers).get("cookie")).toBe("CSRF=guest-session");
      return Response.json({
        sourceCurrency: "USD", destinationCurrency: "SGD", destinationCountry,
        quote: { pricing: [{
          paymentType: { type: method }, disbursementType: "DEPOSIT",
          sendAmount: money("1000.00", "USD"), receiveAmount: money("1253.30", "SGD"),
          feeAmount: money("4.99", "USD"), fxRate: { rate: "1.2533" }, tags: [{ type: "BEST_RATE" }],
        }] },
      });
    }
    return new Response(null, { status: 503 });
  });
}

describe("US bank-funded remittances", () => {
  it("keeps the exact bank-funded SGD reference in the local-bank view without ranking it", async () => {
    const result = await comparePrices(input, { fetcher: providerFetch(), now });
    expect(result.rows).toEqual(expect.arrayContaining([expect.objectContaining({
      providerSlug: "xoom", recipientAmount: 1253.30, feeAmount: 4.99,
      partial: true, costComplete: false, shortfall: null,
    })]));
    expect(result.rows.find(row => row.providerSlug === "xoom")?.publicOffer).toBeUndefined();
  });

  it("rejects a response priced for another country or funding method", async () => {
    for (const fetcher of [providerFetch("IN"), providerFetch("SG", "CARD")]) {
      const result = await comparePrices(input, { fetcher, now });
      expect(result.rows.some(row => row.providerSlug === "xoom")).toBe(false);
    }
  });

  it("skips personal quote sources for business and wire-transfer requests", async () => {
    for (const context of [{ ...input.context!, profile: "business" as const, purpose: "services" as const },
      { ...input.context!, paymentMethod: "wire" as const }]) {
      const fetcher = providerFetch();
      await comparePrices({ ...input, context }, { fetcher, now });
      expect(fetcher.mock.calls.some(([url]) => String(url).includes("xoom.com"))).toBe(false);
    }
  });

  it("accepts Xoom's documented payout shape with local rounding and preserves the funding fee", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).includes("/vietnam/send-money")) return new Response(null, { headers: { "set-cookie": "CSRF=guest-session; Secure; Path=/" } });
      expect(JSON.parse(String(options?.body)).variables).toMatchObject({ destinationCountry: "VN", destinationCurrency: "VND", amount: "1000" });
      return Response.json({
        sourceCurrency: "USD", destinationCurrency: "VND", destinationCountry: "VN", validations: [],
        quote: { pricing: [{
          paymentType: { type: "ACH" }, disbursementType: "DEPOSIT",
          sendAmount: money("1000.00", "USD"), receiveAmount: money("24955300.00", "VND"),
          feeAmount: money("2.99", "USD"), fxRate: { rate: "24955.3388" }, tags: [{ type: "BEST_RATE" }],
        }] },
      });
    });
    const rows = await usBankRemittanceRows("VND", 1000, fetcher, now);
    expect(rows).toEqual([expect.objectContaining({ providerSlug: "xoom", recipientAmount: 24955300, feeAmount: 2.99, partial: true })]);
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it("omits an amount-specific Xoom payout the provider marks unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/kenya/send-money")
      ? new Response(null, { headers: { "set-cookie": "CSRF=guest-session; Secure; Path=/" } })
      : Response.json({
        sourceCurrency: "USD", destinationCurrency: "KES", destinationCountry: "KE",
        quote: { pricing: [{
          paymentType: { type: "ACH" }, disbursementType: "DEPOSIT",
          sendAmount: money("1000.00", "USD"), receiveAmount: money("124975.00", "KES"),
          feeAmount: money("2.99", "USD"), fxRate: { rate: "124.975" }, validations: [{ code: "unsupportedAmount" }],
        }] },
      }));
    expect(await usBankRemittanceRows("KES", 1000, fetcher, now)).toEqual([]);
  });
});
