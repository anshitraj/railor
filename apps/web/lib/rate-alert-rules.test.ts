import { describe, expect, it } from "vitest";
import type { PriceRow } from "@railor/core";
import { bestCompletePrice, completePrices, formatMoney } from "./rate-alert-rules";

const row = (slug: string, recipientAmount: number | null, extra: Partial<PriceRow> = {}): PriceRow => ({
  providerSlug: slug, providerName: slug, basis: "published", recipientAmount, feeAmount: 1, feeCurrency: "USD",
  rate: 93, totalCostPct: 0.5, partial: false, delivery: null, observedAt: "", source: { label: slug }, notes: [], ...extra,
});

describe("rate alert rules", () => {
  it("judges only complete prices that apply to the profile", () => {
    const rows = [
      row("market:wise", 99_000, { basis: "market_estimate" }),
      row("wise", 98_000, { partial: true }),
      row("xflow", 97_000, { costComplete: false }),
      row("aspora", 96_000, { profileAssessment: { status: "not_supported" } as PriceRow["profileAssessment"] }),
      row("broken", null),
      row("infinity", 93_000, { basis: "exact" }),
      row("skydo", 92_000),
    ];
    expect(bestCompletePrice(rows)).toMatchObject({ providerSlug: "infinity", amount: 93_000, basis: "exact" });
    expect(bestCompletePrice(rows, "skydo")).toMatchObject({ amount: 92_000 });
    expect(bestCompletePrice(rows, "market:wise")).toBeNull();
  });

  it("carries each provider's delivery estimate and a clean name into the update", () => {
    const [first] = completePrices([row("skydo", 92_000, { providerName: "Skydo · receive by bank", delivery: "In minutes" })]);
    expect(first).toMatchObject({ providerName: "Skydo", delivery: "In minutes", amount: 92_000 });
  });

  it("formats unknown currency codes without throwing", () => {
    expect(formatMoney(1234.5, "INR")).toBe("INR 1,234.50");
    expect(formatMoney(10, "USDT")).toBe("USDT 10");
  });
});
