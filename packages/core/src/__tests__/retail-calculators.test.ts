import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";
import { bitsoPublicPrice, bookMyForexPublicPrice, careemPublicPrice, instaremPublicPrice, lemfiPublicPrice, nalaPublicPrice, rextiePublicPrice, riaPublicPrice, sendwavePublicPrice, transferGoPublicPrice, walutomatPublicPrice, westernUnionPublicPrice } from "../public-pricing/retail-calculators.js";

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

  it("reads Instarem's public calculator across supported currencies and respects regular fees", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toContain("www.instarem.com/api/v1/public/transaction/computed-value");
      return Response.json({
        success: true,
        data: {
          source_currency: "SGD",
          destination_currency: "INR",
          gross_source_amount: 1000,
          destination_amount: 64250,
          fx_rate: 64.5,
          instarem_fx_rate: 64.5,
          transaction_fee_amount: 3.88,
          regular_transaction_fee_amount: 3.88,
          first_instarem_transaction: false,
          fx_rate_last_updated: "2026-11-19T12:55:00Z",
        },
      });
    });
    const route: PriceCheckInput = {
      sourceCurrency: "SGD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "SG", paymentMethod: "transfer_service" },
    };
    expect(await instaremPublicPrice(route, fetcher, now)).toMatchObject({
      providerSlug: "instarem",
      rate: 64.5,
      recipientAmount: 64250,
      feeAmount: 3.88,
      partial: true,
    });
  });

  it("supports expanded Sendwave and LemFi corridors such as US to India and UK to Nigeria", async () => {
    const swFetcher = vi.fn<typeof fetch>(async () => Response.json({
      effectiveExchangeRate: "88.50", effectiveSendAmount: "1000.00", effectiveFeeAmount: "0.00",
      payAmount: "1000.00", receiveAmount: "88500.00", campaignsApplied: [], sendBonusAmount: "0",
    }));
    const usIn: PriceCheckInput = {
      sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "US", paymentMethod: "transfer_service" },
    };
    expect(await sendwavePublicPrice(usIn, swFetcher, now)).toMatchObject({ providerSlug: "sendwave", recipientAmount: 88500 });

    const lemPayload = [null, { data: 2 }, ["ShallowReactive", 3], { "currency-converter-v-0-0-0": 4 },
      { failure: 5, ageMs: 6, quote: 7 }, null, 0, { baseRate: 8, rate: 8, stale: 9, promotion: 5, fee: 10 },
      "1950.5", false, { min: 6, max: 6, minTransactionAmount: 6 }];
    const lemFetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toBe("https://lemfi.com/en-gb/international-money-transfer/nigeria");
      return new Response(`1 GBP = 1950.5 NGN<script id="__NUXT_DATA__">${JSON.stringify(lemPayload)}</script>`);
    });
    const gbNg: PriceCheckInput = {
      sourceCurrency: "GBP", destinationCurrency: "NGN", destinationCountry: "NG", amount: 100,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "GB", paymentMethod: "transfer_service" },
    };
    expect(await lemfiPublicPrice(gbNg, lemFetcher, now)).toMatchObject({ providerSlug: "lemfi", recipientAmount: 195050, feeAmount: 0 });
  });

  it("reads Ria Money Transfer's public calculator, marks promo offers, and respects send limits", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-ria-session";
    const riaFetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/Authorization/session")) {
        return Response.json({ authToken: { jwtToken: jwt } });
      }
      if (String(url).includes("/MoneyTransferCalculator/Calculate")) {
        return Response.json({
          model: {
            transferDetails: {
              selections: {
                countryTo: "IN",
                currencyFrom: "USD",
                currencyTo: "INR",
                amountFrom: 1000,
                paymentMethod: "BankAccount",
                deliveryMethod: "BankDeposit",
              },
              calculations: {
                amountFrom: 1000,
                amountTo: 93627.7,
                exchangeRate: 92.64,
                exchangeRatePromo: 93.6277,
                transferFee: 0,
                totalFeesAndTaxes: 0,
                taxAmount: 0,
                sendAmountLimit: { minimumSendFromAmount: 1, maximumSendFromAmount: 49999 },
              },
            },
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    const usIn: PriceCheckInput = {
      sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "US", paymentMethod: "transfer_service" },
    };
    const promo = await riaPublicPrice(usIn, riaFetcher, now, false);
    expect(promo).toMatchObject({
      providerSlug: "ria",
      basis: "live_public",
      recipientAmount: 93627.7,
      feeAmount: 0,
      feeCurrency: "USD",
      rate: 93.6277,
      partial: true,
      publicOffer: { kind: "first_transfer" },
    });
    expect(promo?.notes.join(" ")).toContain("92.64");

    // Standard non-promo quote (GB -> IN)
    const gbFetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/Authorization/session")) return Response.json({ authToken: { jwtToken: jwt } });
      return Response.json({
        model: {
          transferDetails: {
            selections: {
              countryTo: "IN",
              currencyFrom: "GBP",
              currencyTo: "INR",
              amountFrom: 500,
              paymentMethod: "BankAccount",
              deliveryMethod: "BankDeposit",
            },
            calculations: {
              amountFrom: 500,
              amountTo: 55000,
              exchangeRate: 110,
              exchangeRatePromo: null,
              transferFee: 2.99,
              totalFeesAndTaxes: 2.99,
              taxAmount: 0,
              sendAmountLimit: { minimumSendFromAmount: 1, maximumSendFromAmount: 8000 },
            },
          },
        },
      });
    });
    const gbIn: PriceCheckInput = {
      sourceCurrency: "GBP", destinationCurrency: "INR", destinationCountry: "IN", amount: 500,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "GB", paymentMethod: "transfer_service" },
    };
    const standard = await riaPublicPrice(gbIn, gbFetcher, now, false);
    expect(standard).toMatchObject({ providerSlug: "ria", recipientAmount: 55000, feeAmount: 2.99, feeCurrency: "GBP", rate: 110 });
    expect(standard?.publicOffer).toBeUndefined();

    // Above max send limit -> null
    const overLimitFetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/Authorization/session")) return Response.json({ authToken: { jwtToken: jwt } });
      return Response.json({
        model: {
          transferDetails: {
            selections: { countryTo: "IN", currencyFrom: "GBP", currencyTo: "INR", amountFrom: 10000 },
            calculations: { amountFrom: 10000, amountTo: 1100000, exchangeRate: 110, exchangeRatePromo: null, transferFee: 2.99, totalFeesAndTaxes: 2.99, sendAmountLimit: { minimumSendFromAmount: 1, maximumSendFromAmount: 8000 } },
          },
        },
      });
    });
    expect(await riaPublicPrice({ ...gbIn, amount: 10000 }, overLimitFetcher, now, false)).toBeNull();
  });

  it("reads Western Union's price catalog and prefers Direct to Bank with bank-account funding", async () => {
    const wuFetcher = vi.fn<typeof fetch>(async () => Response.json({
      services_groups: [
        {
          service: "000", service_name: "Money In Minutes", fund_out: "000", speed_days: 1,
          pay_groups: [{ fund_in: "CC", fx_rate: 91.0294, send_amount: 1000, receive_amount: 91030, gross_fee: 35.99, min_amount: 0, max_amount: 50000 }],
        },
        {
          service: "500", service_name: "Direct to Bank", fund_out: "500", speed_days: 1,
          pay_groups: [
            { fund_in: "CC", fx_rate: 91.0294, send_amount: 1000, receive_amount: 91030, gross_fee: 30, min_amount: 0, max_amount: 50000 },
            { fund_in: "AC", fx_rate: 91.8603, send_amount: 1000, receive_amount: 91861, gross_fee: 0, min_amount: 0, max_amount: 50000 },
          ],
        },
      ],
    }));
    const usIn: PriceCheckInput = {
      sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "US", paymentMethod: "transfer_service" },
    };
    const row = await westernUnionPublicPrice(usIn, wuFetcher, now);
    expect(row).toMatchObject({
      providerSlug: "western-union", basis: "live_public", recipientAmount: 91861, feeAmount: 0, feeCurrency: "USD", rate: 91.8603, partial: true,
    });
    expect(row?.product?.label).toContain("Direct to Bank");
  });

  it("reads TransferGo's booking quotes across UK/EU corridors for personal and business senders", async () => {
    const tgFetcher = vi.fn<typeof fetch>(async () => Response.json({
      options: [{
        code: "bank-accountIdentifier",
        isDefault: true,
        availability: { isAvailable: true, maxAmount: { value: "1000000.00" } },
        promotion: { isApplied: false },
        visibility: { estimateLabel: "in_one_business_day" },
        rate: { value: "120.96187" },
        fee: { value: "3.99" },
        sendingAmount: { value: "1000.00" },
        receivingAmount: { value: "120479.22" },
      }],
    }));
    const gbIn: PriceCheckInput = {
      sourceCurrency: "GBP", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "business", purpose: "services", direction: "send", country: "GB", paymentMethod: "local_bank" },
    };
    expect(await transferGoPublicPrice(gbIn, tgFetcher, now)).toMatchObject({
      providerSlug: "transfergo", recipientAmount: 120479.22, feeAmount: 3.99, feeCurrency: "GBP", rate: 120.96187, delivery: "1 business day",
    });
  });

  it("reads NALA's first-party live FX feed, BookMyForex outward INR TT card, and Rextie Peru USD/PEN quotes", async () => {
    const nalaFetcher = vi.fn<typeof fetch>(async () => Response.json({
      data: [
        { source_currency: "GBP", destination_currency: "INR", rate: "120.38", provider_name: "Western Union", created_at: "2026-11-19T12:55:00Z" },
        { source_currency: "GBP", destination_currency: "INR", rate: "121.56", provider_name: "NALA", created_at: "2026-11-19T12:55:00Z" },
      ],
    }));
    const gbIn: PriceCheckInput = {
      sourceCurrency: "GBP", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "GB", paymentMethod: "transfer_service" },
    };
    expect(await nalaPublicPrice(gbIn, nalaFetcher, now, false)).toMatchObject({
      providerSlug: "nala", rate: 121.56, recipientAmount: 121560, feeAmount: null, partial: true,
    });

    const bmfFetcher = vi.fn<typeof fetch>(async () => Response.json({
      type: "success",
      result: [{ currency_code: "USD", btt: "93.6202" }],
    }));
    const inUs: PriceCheckInput = {
      sourceCurrency: "INR", destinationCurrency: "USD", destinationCountry: "US", amount: 100000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "IN", paymentMethod: "local_bank" },
    };
    const bmf = await bookMyForexPublicPrice(inUs, bmfFetcher, now, false);
    expect(bmf).toMatchObject({ providerSlug: "bookmyforex", recipientAmount: 1068.15, feeAmount: null, partial: true });

    const rextieFetcher = vi.fn<typeof fetch>(async () => Response.json({
      source_currency: "USD", target_currency: "PEN", source_amount: "1000.00", target_amount: "3455.50",
      fx_rate_buy: "3.4555", fx_rate_sell: "3.4855", valid_until: "2026-11-19T13:05:00Z", min_amount: "0.00", max_amount: "10000000.00",
    }));
    const usPe: PriceCheckInput = {
      sourceCurrency: "USD", destinationCurrency: "PEN", destinationCountry: "PE", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "PE", paymentMethod: "local_bank" },
    };
    expect(await rextiePublicPrice(usPe, rextieFetcher, now)).toMatchObject({
      providerSlug: "rextie", recipientAmount: 3455.5, feeAmount: 0, rate: 3.4555, partial: true,
    });

    const walFetcher = vi.fn<typeof fetch>(async () => Response.json([
      { pair: "EUR_PLN", bestOffers: { bid_now: 4.4758, ask_now: 4.4794 } },
    ]));
    const plEur: PriceCheckInput = {
      sourceCurrency: "EUR", destinationCurrency: "PLN", destinationCountry: "PL", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "PL", paymentMethod: "local_bank" },
    };
    expect(await walutomatPublicPrice(plEur, walFetcher, now, false)).toMatchObject({
      providerSlug: "walutomat", rate: 4.4758, feeAmount: 2, recipientAmount: 4466.85, partial: true,
    });

    const bitsoFetcher = vi.fn<typeof fetch>(async () => Response.json({
      success: true,
      payload: [{ book: "usd_mxn", bid: "19.712", ask: "19.713", created_at: "2026-11-19T12:55:00Z" }],
    }));
    const usMx: PriceCheckInput = {
      sourceCurrency: "USD", destinationCurrency: "MXN", destinationCountry: "MX", amount: 1000,
      context: { profile: "personal", purpose: "personal", direction: "send", country: "US", paymentMethod: "local_bank" },
    };
    expect(await bitsoPublicPrice(usMx, bitsoFetcher, now, false)).toMatchObject({
      providerSlug: "bitso", rate: 19.712, recipientAmount: 19712, feeAmount: null, partial: true,
    });
  });
});
