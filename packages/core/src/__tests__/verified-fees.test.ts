import { describe, expect, it } from "vitest";
import { comparePrices, PUBLISHED_PRICING, UNPRICED_PRODUCTS, type PriceCheckInput } from "../pricing.js";

/**
 * Fee schedules re-read from each provider's own pages on 2026-11-18, checked at
 * the three invoice sizes the comparison is judged on ($500, $1,700, $4,000):
 *   Infinity — 0.5% flat, GST included, zero FX markup (FAQ + pricing blog)
 *   Skydo    — USD 19 to 2,000 / USD 29 to 10,000, +18% GST, zero FX margin
 *   Xflow    — Starter USD 12 to 2,000 then 0.6%; Growth USD 20 to 5,000 then 0.4%
 *   Wise Business India receiving — read from the pricing-page calculator in a
 *     real browser (USD to INR, paid by ACH): total fees USD 10.96, 33.19 and
 *     75.82, each a Wise fee plus 18% GST. Wise's help centre also names a
 *     USD 2 e-FIRC charge that the pricing page calls free, so the row stays
 *     partial until that is settled.
 */
const now = new Date("2026-11-18T12:00:00Z");
const base: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services", paymentMethod: "local_bank" } };
const schedule = (slug: string) => PUBLISHED_PRICING.find((item) => item.slug === slug)!;

// Wise's public quote at 90 INR per USD for whatever amount was asked; every other source fails.
const fetcher: typeof fetch = async (url, init) => {
  if (!String(url).includes("/v3/quotes")) return new Response("{}", { status: 503 });
  const { sourceAmount } = JSON.parse(String(init?.body ?? "{}")) as { sourceAmount: number };
  return Response.json({ sourceAmount, sourceCurrency: "USD", targetCurrency: "INR", rate: 90, expirationTime: "2026-11-18T12:30:00Z", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount, targetAmount: (sourceAmount - 5) * 90, fee: { total: 5 } }] });
};

describe("first-party fee schedules (checked 2026-11-18)", () => {
  it.each([
    [500, 2.5, 22.42, 12, "xflow:starter"],
    [1700, 8.5, 22.42, 12, "xflow:starter"],
    [4000, 20, 34.22, 20, "xflow:growth"],
  ])("USD %d: Infinity, Skydo and Xflow fees match the providers' pages", (amount, infinity, skydo, xflow, plan) => {
    const input = { ...base, amount };
    expect(schedule("infinity").fee(input, amount)).toMatchObject({ amount: infinity, currency: "USD" });
    expect(schedule("skydo").fee(input, amount)).toMatchObject({ amount: skydo, currency: "USD" });
    expect(schedule("xflow").fee(input, amount)).toMatchObject({ amount: xflow, currency: "USD", plan: { id: plan } });
  });

  it("switches Xflow to the Growth plan only where it is cheaper", () => {
    expect(schedule("xflow").fee({ ...base, amount: 3300 }, 3300)).toMatchObject({ amount: 19.8, plan: { id: "xflow:starter" } });
    expect(schedule("xflow").fee({ ...base, amount: 3400 }, 3400)).toMatchObject({ amount: 20, plan: { id: "xflow:growth" } });
    expect(schedule("xflow").fee({ ...base, amount: 6000 }, 6000)).toMatchObject({ amount: 24, plan: { id: "xflow:growth" } });
  });

  it("names the exact missing input on every partial published schedule", () => {
    for (const item of PUBLISHED_PRICING.filter((entry) => entry.partial)) expect(item.missing?.length, item.slug).toBeGreaterThan(0);
  });

  it("carries the plan, the missing input and the tax wording onto the row", async () => {
    const result = await comparePrices({ ...base, amount: 4000 }, { fetcher, now });
    const xflow = result.rows.find((row) => row.providerSlug === "xflow")!;
    expect(xflow.product).toEqual({ id: "xflow:growth", label: "Xflow · Growth plan account" });
    expect(xflow.missing?.[0]).toContain("conversion rate");
    expect(xflow.taxNote).toContain("reverse charge");
    expect(result.rows.find((row) => row.providerSlug === "infinity")).toMatchObject({ feeAmount: 20, taxIncluded: true, recipientAmount: 358_200,
      // Infinity issues a free FIRA; the exact wording follows its own help page, so only the FIRA is pinned here.
      receipt: expect.stringContaining("FIRA") });
  });

  // Wise's calculator, read at 93.44 INR per USD: [amount, Wise fee, GST, total fees]. It moves a cent with the FX rate.
  it.each([
    [500, 9.29, 1.67, 10.96],
    [1700, 28.13, 5.06, 33.19],
    [4000, 64.25, 11.57, 75.82],
  ])("USD %d: Wise Business India receiving is within a cent of its calculator (fee %d + GST %d = %d)", (amount, _fee, _gst, total) => {
    const fee = schedule("wise").fee({ ...base, amount }, amount, 93.44)!;
    expect(fee.currency).toBe("USD");
    expect(Math.abs(fee.amount - total)).toBeLessThanOrEqual(0.0101);
    expect(fee.parts.join(" ")).toContain("1.6% conversion fee plus a fixed USD 1.46");
  });

  it("applies Wise's per-receipt limits and only prices USD", () => {
    const wise = schedule("wise");
    expect(wise.fee({ ...base, amount: 4.99 }, 4.99, 93.44)).toBeNull();
    expect(wise.fee({ ...base, amount: 5 }, 5, 93.44)).not.toBeNull();
    // INR 2,500,000 at 93.44 is about USD 26,757.
    expect(wise.fee({ ...base, amount: 26_700 }, 26_700, 93.44)).not.toBeNull();
    expect(wise.fee({ ...base, amount: 26_800 }, 26_800, 93.44)).toBeNull();
    expect(wise.fee({ ...base, amount: 1700 }, null, 93.44)).toBeNull();
    expect(wise.fee({ ...base, amount: 1700 }, 1700, null)).toBeNull();
    expect(wise.appliesTo(base)).toBeNull();
    expect(wise.appliesTo({ ...base, sourceCurrency: "EUR" })).not.toBeNull();
    expect(wise.appliesTo({ ...base, context: { ...base.context!, direction: "send" } })).not.toBeNull();
    expect(wise.appliesTo({ ...base, context: { ...base.context!, profile: "personal" } })).not.toBeNull();
  });

  it("prices Wise Business India receiving as its own partial product, apart from 'Client sends with Wise'", async () => {
    const bank = await comparePrices({ ...base, amount: 1700 }, { fetcher, now });
    const wise = bank.rows.find((row) => row.providerSlug === "wise" && row.basis === "published")!;
    expect(wise).toMatchObject({
      providerName: "Wise Business", product: { id: "wise:published", label: "Wise Business · India receiving account" },
      feeCurrency: "USD", paymentMethods: ["local_bank"], taxIncluded: false, receipt: "e-FIRC",
      partial: true, costComplete: false, shortfall: null, rate: 90,
      source: { url: "https://wise.com/in/pricing/business/receive" },
      profileAssessment: { status: "documented", priceApplicable: true },
    });
    expect(Math.abs(wise.feeAmount! - 33.19)).toBeLessThanOrEqual(0.0101);
    expect(wise.recipientAmount).toBeCloseTo((1700 - wise.feeAmount!) * 90, 2);
    expect(wise.missing?.[0]).toContain("e-FIRC");
    expect(wise.notes.join(" ")).toContain("Swift or wire costs more");
    // Priced, so it is no longer listed as unavailable; the unpriced entry only covers what is not priced.
    expect(bank.unavailable.some((entry) => entry.providerSlug === "wise")).toBe(false);
    // A bank-funded "Client sends with Wise" quote may sit beside it, but stays a separate, payer-side product.
    for (const row of bank.rows.filter((row) => row.providerSlug === "wise" && row !== wise)) expect(row).toMatchObject({ side: "payer", basis: "live_public" });

    const app = await comparePrices({ ...base, amount: 1700, context: { ...base.context!, paymentMethod: "transfer_service" } }, { fetcher, now });
    expect(app.unavailable.some((entry) => entry.product?.startsWith("Wise Business"))).toBe(false);
    expect(app.rows.some((row) => row.product?.label.startsWith("Wise Business"))).toBe(false);
    expect(app.rows.find((row) => row.providerSlug === "wise")?.product?.label).toBe("Client sends with Wise");
  });

  it("keeps the unpriced Wise entry only for what the Wise schedule does not cover", () => {
    const unpriced = UNPRICED_PRODUCTS[0]!;
    expect(unpriced).toMatchObject({ slug: "wise", product: "Wise Business · India receiving account", sourceUrl: "https://wise.com/in/pricing/business/receive" });
    expect(unpriced.appliesTo({ ...base, amount: 1700 })).toBe(false);
    expect(unpriced.appliesTo({ ...base, sourceCurrency: "EUR", amount: 1700 })).toBe(true);
    expect(unpriced.appliesTo({ ...base, amount: 1700, context: { ...base.context!, purpose: "goods" } })).toBe(true);
    expect(unpriced.appliesTo({ ...base, amount: 1700, context: { ...base.context!, paymentMethod: "transfer_service" } })).toBe(false);
  });
});
