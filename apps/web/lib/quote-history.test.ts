import { describe, expect, it, vi } from "vitest";
import type { PriceRow } from "@railor/core";

vi.mock("server-only", () => ({}));
vi.mock("@railor/database", () => ({ activePromotions: vi.fn(), getDb: vi.fn(), recordQuoteSnapshots: vi.fn() }));

const { snapshotRows } = await import("./quote-history");

const row = (over: Partial<PriceRow>): PriceRow => ({
  providerSlug: "wise", providerName: "Wise", basis: "live_public", recipientAmount: 92_000, feeAmount: 5, feeCurrency: "USD", rate: 92.5,
  totalCostPct: 0.5, partial: false, delivery: null, observedAt: "2026-11-25T10:00:00Z", source: { label: "wise.com", url: "https://wise.com" }, notes: [], ...over,
});

describe("snapshotRows", () => {
  const input = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, profile: "personal" };

  it("keeps public prices a profile can use, once per provider", () => {
    const rows = snapshotRows(input, [
      row({}),
      row({ recipientAmount: 91_000 }),
      row({ providerSlug: "acme-bank", providerName: "Acme Bank · Wire", basis: "published", recipientAmount: 90_000 }),
      row({ providerSlug: "mine", basis: "exact" }),
      row({ providerSlug: "nope", recipientAmount: null }),
      row({ providerSlug: "blocked", profileAssessment: { status: "not_supported" } as PriceRow["profileAssessment"] }),
      row({ providerSlug: "market:wise", basis: "market_estimate", recipientAmount: 93_000 }),
      row({ providerSlug: "refrens", providerName: "Refrens", basis: "published", recipientAmount: 89_000 }),
    ], 92.6);
    expect(rows.map((item) => item.providerSlug)).toEqual(["wise", "acme-bank", "refrens"]);
    expect(rows.find((item) => item.providerSlug === "refrens")?.category).toBe("transfer");
    expect(rows[0]).toMatchObject({ profile: "personal", recipientAmount: 92_000, midMarketRate: 92.6, category: "transfer", sourceUrl: "https://wise.com" });
    expect(rows[1]).toMatchObject({ providerName: "Acme Bank", category: "bank" });
  });
});
