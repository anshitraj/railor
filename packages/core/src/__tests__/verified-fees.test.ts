import { describe, expect, it } from "vitest";
import { comparePrices, PUBLISHED_PRICING, UNPRICED_PRODUCTS, type PriceCheckInput } from "../pricing.js";

/**
 * Fee schedules re-read from each provider's own pages on 2026-11-18, checked at
 * the three invoice sizes the comparison is judged on ($500, $1,700, $4,000):
 *   Infinity — 0.5% flat, GST included, zero FX markup (FAQ + pricing blog)
 *   Skydo    — USD 19 to 2,000 / USD 29 to 10,000, +18% GST, zero FX margin
 *   Xflow    — Starter USD 12 to 2,000 then 0.6%; Growth USD 20 to 5,000 then 0.4%
 *   Wise Business India receiving — USD 2 e-FIRC + 18% GST published; the
 *     conversion fee is not, so it stays unpriced.
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
    expect(result.rows.find((row) => row.providerSlug === "infinity")).toMatchObject({ feeAmount: 20, taxIncluded: true, receipt: "FIRA (free, automatic)", recipientAmount: 358_200 });
  });

  it("lists Wise Business India receiving without a price, apart from 'Client sends with Wise'", async () => {
    const bank = await comparePrices({ ...base, amount: 1700 }, { fetcher, now });
    expect(bank.unavailable.find((entry) => entry.product === "Wise Business · India receiving account")).toMatchObject({ providerSlug: "wise", sourceUrl: UNPRICED_PRODUCTS[0]!.sourceUrl });
    expect(bank.rows.some((row) => row.product?.label.startsWith("Wise Business"))).toBe(false);

    const app = await comparePrices({ ...base, amount: 1700, context: { ...base.context!, paymentMethod: "transfer_service" } }, { fetcher, now });
    expect(app.unavailable.some((entry) => entry.product?.startsWith("Wise Business"))).toBe(false);
    expect(app.rows.find((row) => row.providerSlug === "wise")?.product?.label).toBe("Client sends with Wise");
  });
});
