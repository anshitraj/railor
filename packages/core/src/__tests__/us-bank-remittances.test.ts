import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";

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
});
