import { describe, expect, it } from "vitest";
import { taptapFee, taptapSendPublicPrice } from "../public-pricing/retail-calculators.js";
import type { PriceCheckInput } from "../pricing.js";

const rates = { availableCountries: [
  { isoCountryCode: "US", currency: "USD", corridors: [
    { isoCountryCode: "IN", currency: "INR", fxRate: "92.33", feeSchedule: { type: "standard", flatFee: "1.99" } },
    { isoCountryCode: "PK", currency: "PKR", fxRate: "275.00", feeSchedule: { type: "tiered", tiers: [{ fee: "1.99", minValue: "0.00" }, { fee: "0.00", minValue: "200.00" }] } },
    { isoCountryCode: "MX", currency: "MXN", fxRate: "19.50" },
  ] },
  { isoCountryCode: "GB", currency: "GBP", corridors: [{ isoCountryCode: "IN", currency: "INR", fxRate: "120.75" }] },
] };
const fetcher = async () => Response.json(rates);
const now = new Date("2026-11-26T00:00:00Z");
const send = (from: string, to: string, country: string, destinationCountry: string, amount = 1000): PriceCheckInput => ({
  sourceCurrency: from, destinationCurrency: to, destinationCountry, amount, includeMarket: true,
  context: { profile: "personal", country, direction: "send", purpose: "personal" },
});

describe("Taptap Send published rates", () => {
  it("reads flat and tiered fees for the amount", () => {
    expect(taptapFee({ type: "standard", flatFee: "1.99" }, 50)).toBe(1.99);
    expect(taptapFee({ type: "tiered", tiers: [{ fee: "1.99", minValue: "0.00" }, { fee: "0.00", minValue: "200.00" }] }, 150)).toBe(1.99);
    expect(taptapFee({ type: "tiered", tiers: [{ fee: "1.99", minValue: "0.00" }, { fee: "0.00", minValue: "200.00" }] }, 200)).toBe(0);
    expect(taptapFee(undefined, 100)).toBeNull();
  });

  it("prices a US sender to India with the fee paid on top", async () => {
    const row = await taptapSendPublicPrice(send("USD", "INR", "US", "IN"), fetcher, now, false);
    expect(row).toMatchObject({ providerSlug: "taptap-send", recipientAmount: 92_330, feeAmount: 1.99, rate: 92.33, basis: "live_public", senderCountry: "US" });
  });

  it("leaves an unpublished fee unknown instead of free, and stays out of other sender countries and business transfers", async () => {
    const mexico = await taptapSendPublicPrice(send("USD", "MXN", "US", "MX"), fetcher, now, false);
    expect(mexico?.feeAmount).toBeNull();
    expect(mexico?.missing?.[0]).toContain("doesn’t publish a fee");
    expect(await taptapSendPublicPrice(send("USD", "INR", "CA", "IN"), fetcher, now, false)).toBeNull();
    const business = { ...send("USD", "INR", "US", "IN"), context: { profile: "business", country: "US", direction: "send", purpose: "services" } } as PriceCheckInput;
    expect(await taptapSendPublicPrice(business, fetcher, now, false)).toBeNull();
  });
});
