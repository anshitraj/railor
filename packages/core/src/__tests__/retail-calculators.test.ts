import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";
import { careemPublicPrice, lemfiPublicPrice, sendwavePublicPrice } from "../public-pricing/retail-calculators.js";

const now = new Date("2026-11-19T13:00:00Z");
const input: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "GHS", destinationCountry: "GH", amount: 1000,
  context: { profile: "personal", purpose: "personal", direction: "send", country: "US", paymentMethod: "transfer_service" } };

const sendwave = { effectiveExchangeRate: "11.77", effectiveSendAmount: "1000.00", effectiveFeeAmount: "0.00",
  payAmount: "1000.00", receiveAmount: "11770.00", campaignsApplied: [], sendBonusAmount: "0" };
const careem = { destinationCountry: "IN", destinationCurrency: "INR", rate: 25.44, fee: 5, minAmount: 10,
  maxAmount: 150000, estimatedTime: "Money should arrive within 1 hour" };

describe("retail publisher calculators", () => {
  it("checks the Sendwave amount and fee and exposes a partial price through comparePrices", async () => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (new URL(String(url)).host !== "www.sendwave.com") return new Response(null, { status: 404 });
      expect(new URL(String(url)).searchParams).toEqual(new URLSearchParams(
        "amountType=SEND&amount=1000&sendCurrency=USD&receiveCurrency=GHS&sendCountryIso2=us&receiveCountryIso2=gh&locale=en"));
      return Response.json(sendwave);
    });
    const result = await comparePrices(input, { fetcher, now });
    expect(result.rows.find(row => row.providerSlug === "sendwave")).toMatchObject({ recipientAmount: 11770, feeAmount: 0, partial: true, shortfall: null });
    expect(await sendwavePublicPrice(input, async () => Response.json({ ...sendwave, payAmount: "1001.00" }), now)).toBeNull();
    expect(await sendwavePublicPrice({ ...input, context: { ...input.context!, paymentMethod: "local_bank" } }, fetcher, now)).toBeNull();
  });

  it("reads a standard no-fee LemFi rate and suppresses a stale or promotional payload", async () => {
    const payload = [null, { data: 2 }, ["ShallowReactive", 3], { "currency-converter-v-0-0-0": 4 },
      { failure: 5, ageMs: 6, quote: 7 }, null, 0, { baseRate: 8, rate: 8, stale: 9, promotion: 5, fee: 10 },
      "11.77", false, { min: 6, max: 6, minTransactionAmount: 6 }];
    const fetcher = async () => new Response(`1 USD = 11.77 GHS<script id="__NUXT_DATA__">${JSON.stringify(payload)}</script>`);
    expect(await lemfiPublicPrice(input, fetcher, now)).toMatchObject({ recipientAmount: 11770, feeAmount: 0, partial: true });
    payload[9] = true;
    expect(await lemfiPublicPrice(input, fetcher, now)).toBeNull();
  });

  it("keeps Careem's fixed widget fee as evidence and requires the right payout country", async () => {
    const fetcher = async () => Response.json([careem, { ...careem, destinationCountry: "LB", destinationCurrency: "USD" }]);
    const route = { ...input, sourceCurrency: "AED", destinationCurrency: "INR", destinationCountry: "IN", context: { ...input.context!, country: "AE" } };
    expect(await careemPublicPrice(route, fetcher, now, false)).toMatchObject({ rate: 25.44, recipientAmount: 25440, feeAmount: null, feeBreakdown: expect.stringContaining("AED 5") });
    expect(await careemPublicPrice({ ...route, destinationCurrency: "USD", destinationCountry: "US" }, fetcher, now, false)).toBeNull();
    expect(await careemPublicPrice({ ...route, amount: 5 }, fetcher, now, false)).toBeNull();
  });
});
