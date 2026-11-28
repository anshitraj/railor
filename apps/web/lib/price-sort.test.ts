import { describe, expect, it } from "vitest";
import type { PriceRow } from "@railor/core";
import { deliveryMinutes, effectiveCostPct, sortPriceEntries } from "./price-sort";

const make = (slug: string, name: string, quote?: Partial<PriceRow>) => ({
  providerSlug: slug,
  providerName: name,
  quote: quote ? ({ providerSlug: slug, providerName: name, basis: "live_public", partial: true, recipientAmount: null, feeAmount: null, feeCurrency: "USD", rate: null, totalCostPct: null, delivery: null, observedAt: "", source: { label: "test" }, notes: [], ...quote } as PriceRow) : undefined,
});

describe("deliveryMinutes", () => {
  it("parses instant, minutes, hours, and business days into comparable minutes", () => {
    expect(deliveryMinutes("Instant")).toBe(1);
    expect(deliveryMinutes("Within seconds")).toBe(1);
    expect(deliveryMinutes("in 24 minutes")).toBe(24);
    expect(deliveryMinutes("Minutes - 24 hours")).toBe(10);
    expect(deliveryMinutes("1–2 hours")).toBe(60);
    expect(deliveryMinutes("Same day")).toBe(360);
    expect(deliveryMinutes("1–2 business days")).toBe(1440);
    expect(deliveryMinutes("2-3 days")).toBe(2880);
    expect(deliveryMinutes(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("sortPriceEntries", () => {
  const wise = make("wise", "Wise", { partial: false, recipientAmount: 91862.71, feeAmount: 11.27, totalCostPct: 1.13, delivery: "in 24 minutes" });
  const ria = make("ria", "Ria Money Transfer", { partial: true, recipientAmount: 93586.93, feeAmount: 0.99, totalCostPct: null, delivery: "Minutes - 24 hours" });
  const sendwave = make("sendwave", "Sendwave", { partial: true, recipientAmount: 92400.0, feeAmount: 0, totalCostPct: null, delivery: "Instant" });
  const unpriced = make("xe", "Xe");

  it("ranks the genuine highest-payout provider first under cheapest (never pinning Wise)", () => {
    const out = sortPriceEntries([wise, ria, sendwave, unpriced], { sort: "cheapest", amount: 1000, referenceRate: 92.91 });
    expect(out.map((e) => e.providerSlug)).toEqual(["ria", "sendwave", "wise", "xe"]);
  });

  it("ranks fastest arrival first under fastest, breaking ties by payout", () => {
    const out = sortPriceEntries([wise, ria, sendwave, unpriced], { sort: "fastest", amount: 1000, referenceRate: 92.91 });
    expect(out.map((e) => e.providerSlug)).toEqual(["sendwave", "ria", "wise", "xe"]);
  });

  it("ranks lowest upfront fee first under lowest_fee, breaking ties by payout", () => {
    const out = sortPriceEntries([wise, ria, sendwave, unpriced], { sort: "lowest_fee", amount: 1000, referenceRate: 92.91 });
    expect(out.map((e) => e.providerSlug)).toEqual(["sendwave", "ria", "wise", "xe"]);
  });

  it("computes effectiveCostPct even for partial live_public quotes with null totalCostPct", () => {
    expect(effectiveCostPct(ria.quote, 1000, 92.91)).toBeLessThan(0);
    expect(effectiveCostPct(wise.quote, 1000, 92.91)).toBeCloseTo(1.13, 2);
  });
});
