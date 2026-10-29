import { describe, expect, it } from "vitest";
import { PUBLISHED_PRICING, comparePrices } from "../pricing.js";

describe("published pricing coverage", () => {
  const xflow = PUBLISHED_PRICING.find(p => p.slug === "xflow")!;
  const atlantic = PUBLISHED_PRICING.find(p => p.slug === "atlantic-money")!;
  const usd = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 2000 };
  it("applies Xflow Starter fee boundaries and never treats its schedule as complete", () => {
    expect(xflow.appliesTo(usd)).toBeNull();
    expect(xflow.fee(usd, 2000)?.amount).toBe(12);
    expect(xflow.fee({ ...usd, amount: 2001 }, 2001)?.amount).toBe(12.01);
    expect(xflow.partial).toBe(true);
    expect(xflow.appliesTo({ ...usd, sourceCurrency: "EUR" })).not.toBeNull();
    expect(xflow.appliesTo({ ...usd, destinationCountry: "MX" })).not.toBeNull();
    expect(xflow.appliesTo({ ...usd, context: { country: "IN", profile: "personal", direction: "receive", purpose: "personal" } })).not.toBeNull();
  });
  it("scopes Atlantic's flat fee to UK business GBP funding and the published currencies", () => {
    const input = { sourceCurrency: "GBP", destinationCurrency: "CAD", amount: 1000, context: { country: "GB", profile: "business" as const, direction: "send" as const, purpose: "services" as const } };
    expect(atlantic.appliesTo(input)).toBeNull();
    expect(atlantic.fee(input, null)).toMatchObject({ amount: 3, currency: "GBP" });
    expect(atlantic.partial).toBe(true);
    expect(atlantic.appliesTo({ ...input, amount: 1_000_001 })).not.toBeNull();
    expect(atlantic.appliesTo({ ...input, destinationCurrency: "JPY" })).not.toBeNull();
    expect(atlantic.appliesTo({ ...input, destinationCountry: "MX" })).not.toBeNull();
    expect(atlantic.appliesTo({ ...input, context: { ...input.context, country: "IN" } })).not.toBeNull();
  });
  it("still exposes the known fee when public FX fails, without inventing a received amount", async () => {
    const result = await comparePrices(usd, { fetcher: (async () => { throw new Error("offline"); }) as typeof fetch });
    const row = result.rows.find(row => row.providerSlug === "xflow");
    expect(row).toMatchObject({ basis: "published", feeAmount: 12, feeCurrency: "USD", recipientAmount: null, rate: null, partial: true });
    expect(row?.source.url).toBe("https://www.xflowpay.com/pricing");
    expect(row?.observedAt).toContain("2026-10-29");
    expect(row?.totalCostPct).toBeNull();
  });
});
