import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";
import { ofxPublicPrice, remitlyPublicPrice, usBankRemittanceRows, worldRemitPublicPrice } from "../public-pricing/us-bank-remittances.js";

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
  it("reads the OFX US calculator for the requested INR amount and preserves unknown funding charges", async () => {
    const fetcher: typeof fetch = async url => String(url) === "https://api.ofx.com/PublicSite.ApiService/OFX/spotrate/Individual/USD/INR/1000"
      ? Response.json({ CustomerRate: 88.9741, CustomerAmount: 88_974.10, Fee: 5, DeliveryCountry: "India" })
      : new Response(null, { status: 404 });
    expect(await usBankRemittanceRows("INR", 1000, fetcher, now)).toEqual([expect.objectContaining({
      providerSlug: "ofx", rate: 88.9741, recipientAmount: 88_974.1, feeAmount: 5, partial: true, costComplete: false,
    })]);
  });

  it("reads WorldRemit's calculator for a bank deposit before funding is selected", async () => {
    const fetcher: typeof fetch = async (url, options) => {
      if (String(url) !== "https://api.worldremit.com/graphql") return new Response(null, { status: 404 });
      expect(JSON.parse(String(options?.body)).variables).toEqual({
        amount: 1000, sendCountry: "US", sendCurrency: "USD", receiveCountry: "IN", receiveCurrency: "INR",
      });
      return Response.json({ data: { createCalculation: { errors: [], calculation: {
        id: null, send: { currency: "USD", amount: 1000 }, receive: { currency: "INR", amount: 92_156 },
        rounding: { receiveRoundingSeed: 1 }, exchangeRate: { value: 92.1557, crossedOutValue: null },
        informativeSummary: { fee: { value: { amount: 0.99, currency: "USD" } }, discount: null, appliedPromotions: null, totalToPay: { amount: 1000.99 } },
      } } } });
    };
    expect(await usBankRemittanceRows("INR", 1000, fetcher, now)).toEqual([expect.objectContaining({
      providerSlug: "world-remit", recipientAmount: 92156, feeAmount: 0.99, partial: true, costComplete: false,
    })]);
  });

  it("keeps the Cameroon USD to XAF total past the promotion cap with an unspecified delivery method", async () => {
    const fetcher: typeof fetch = async url => String(url).includes("remitly.com") ? Response.json({ estimate: {
      conduit: { source_country: "USA", target_country: "CMR", source_currency: { alpha3: "USD" }, target_currency: { alpha3: "XAF" } },
      pay_in_method: "BANK", pay_out_method: "", send_amount: "1000.00", receive_amount: "591020.00", total_charge_amount: "1000.00",
      exchange_rate: { base_rate: "585.10", capped_promotional_exchange_rate_amount: "500.00", promotional_exchange_rate: "596.94" },
      fee: { total_fee_amount: "0.00" }, discount: null, tax_details: null,
    } }) : new Response(null, { status: 404 });
    expect(await usBankRemittanceRows("XAF", 1000, fetcher, now)).toEqual([expect.objectContaining({
      providerSlug: "remitly", recipientAmount: 591020, feeAmount: 0,
      publicOffer: expect.objectContaining({ payoutMethod: "Confirm payout method at checkout" }),
    })]);
  });

  it("keeps Remitly's bank-funded quote across the welcome-rate cap with Brazil tax and discount", async () => {
    const fetcher: typeof fetch = async url => {
      if (!String(url).includes("remitly.com")) return new Response(null, { status: 404 });
      return Response.json({ estimate: {
        conduit: { source_country: "USA", target_country: "BRA", source_currency: { alpha3: "USD" }, target_currency: { alpha3: "BRL" } },
        pay_in_method: "BANK", pay_out_method: "BANK_DEPOSIT", send_amount: "1000.00",
        receive_amount: "5988.08", total_charge_amount: "1003.89",
        exchange_rate: { base_rate: "5.8536", capped_promotional_exchange_rate_amount: "750.00", promotional_exchange_rate: "6.0329" },
        fee: { total_fee_amount: "3.99" }, discount: { fee_discount_amount: "3.99", send_discount_amount: "0.00" },
        tax_details: [{ amount: "3.89", type: "IOF" }],
      } });
    };
    const rows = await usBankRemittanceRows("BRL", 1000, fetcher, now);
    expect(rows).toEqual([expect.objectContaining({
      providerSlug: "remitly", recipientAmount: 5988.08, feeAmount: 3.89,
      taxIncluded: true, taxNote: expect.stringContaining("3.89 IOF"), partial: true,
    })]);
  });

  it("uses the disabled anonymous INR bank amount only as a conditional reference for a sender in India", async () => {
    const fetcher: typeof fetch = async (url, options) => {
      if (!String(url).includes("/v3/quotes")) return new Response(null, { status: 404 });
      const { sourceAmount } = JSON.parse(String(options?.body));
      return Response.json({ sourceCurrency: "INR", rate: 0.01, paymentOptions: [
        { payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", sourceAmount, targetAmount: 987, disabled: true, fee: { total: 1300 } },
        { payIn: "BALANCE", payOut: "BANK_TRANSFER", sourceAmount, targetAmount: 988, disabled: true, fee: { total: 1200 } },
      ] });
    };
    const result = await comparePrices({ sourceCurrency: "INR", destinationCurrency: "USD", amount: 100000, context: { country: "IN", profile: "personal", direction: "send", purpose: "personal", paymentMethod: "local_bank" } }, { fetcher, now });
    expect(result.rows.find(row => row.providerSlug === "wise")).toMatchObject({
      recipientAmount: 987, feeAmount: 1300, partial: true, costComplete: false, source: { url: "https://wise.com/in/send-money/send-money-to-the-usa" },
    });
  });

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
      if (String(url).includes("remitly.com")) return new Response(null, { status: 404 });
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
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes("xoom.com"))).toHaveLength(2);
  });

  it("omits an amount-specific Xoom payout the provider marks unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("remitly.com")
      ? new Response(null, { status: 404 })
      : String(url).includes("/kenya/send-money")
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

  it("reads OFX and WorldRemit public calculators across multi-country non-US corridors", async () => {
    const ofxFetcher: typeof fetch = async (url) => String(url) === "https://api.ofx.com/PublicSite.ApiService/OFX/spotrate/Individual/GBP/INR/1000"
      ? Response.json({ CustomerRate: 112.4, CustomerAmount: 112400, Fee: 0, DeliveryCountry: "India" })
      : new Response(null, { status: 404 });
    const gbIn: PriceCheckInput = {
      sourceCurrency: "GBP", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "GB", paymentMethod: "local_bank" },
    };
    expect(await ofxPublicPrice(gbIn, ofxFetcher, now)).toMatchObject({ providerSlug: "ofx", recipientAmount: 112400, feeAmount: 0, partial: true });

    const wrFetcher: typeof fetch = async (url, options) => {
      expect(String(url)).toBe("https://api.worldremit.com/graphql");
      expect(JSON.parse(String(options?.body)).variables).toEqual({
        amount: 500, sendCountry: "GB", sendCurrency: "GBP", receiveCountry: "NG", receiveCurrency: "NGN",
      });
      return Response.json({ data: { createCalculation: { errors: [], calculation: {
        id: null, send: { currency: "GBP", amount: 500 }, receive: { currency: "NGN", amount: 985000 },
        rounding: { receiveRoundingSeed: 1 }, exchangeRate: { value: 1970, crossedOutValue: null },
        informativeSummary: { fee: { value: { amount: 2.99, currency: "GBP" } }, discount: null, appliedPromotions: null, totalToPay: { amount: 502.99 } },
      } } } });
    };
    const gbNg: PriceCheckInput = {
      sourceCurrency: "GBP", destinationCurrency: "NGN", destinationCountry: "NG", amount: 500,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "GB", paymentMethod: "transfer_service" },
    };
    expect(await worldRemitPublicPrice(gbNg, wrFetcher, now)).toMatchObject({ providerSlug: "world-remit", recipientAmount: 985000, feeAmount: 2.99, partial: true });

    const remitlyFetcher: typeof fetch = async (url) => {
      expect(String(url)).toContain("conduit=GBR%3AGBP-IND%3AINR");
      return Response.json({
        estimate: {
          conduit: {
            source_country: "GBR", target_country: "IND",
            source_currency: { alpha3: "GBP" }, target_currency: { alpha3: "INR" },
          },
          pay_in_method: "DEBIT", pay_out_method: "BANK_DEPOSIT",
          send_amount: "1000.00", receive_amount: "120500.00", total_charge_amount: "1000.00",
          exchange_rate: { base_rate: "120.50", promotional_exchange_rate: null, capped_promotional_exchange_rate_amount: null },
          fee: { total_fee_amount: "0.00" }, discount: null, tax_details: null,
        },
      });
    };
    expect(await remitlyPublicPrice(gbIn, remitlyFetcher, now)).toMatchObject({
      providerSlug: "remitly", recipientAmount: 120500, feeAmount: 0, feeCurrency: "GBP", rate: 120.5, partial: true,
    });
  });
});
