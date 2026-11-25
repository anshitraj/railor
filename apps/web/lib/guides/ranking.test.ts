import { describe, expect, it } from "vitest";
import type { PriceCheckResult, PriceRow } from "@railor/core";
import { listedProviders, rankProviders } from "./ranking";

const NOW = Date.parse("2026-11-25T12:00:00Z");

const row = (providerSlug: string, providerName: string, recipientAmount: number | null, extra: Partial<PriceRow> = {}): PriceRow => ({
  providerSlug, providerName, basis: "live_public", recipientAmount, feeAmount: 0, feeCurrency: "USD", rate: 92, totalCostPct: 0.01, partial: false,
  delivery: "Minutes", observedAt: "2026-11-25T11:58:00Z", source: { label: "Provider calculator" }, notes: [], ...extra,
});

const result = (rows: PriceRow[]) => ({ input: { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true }, rows, generatedAt: "2026-11-25T12:00:00Z", reference: null } as unknown as PriceCheckResult);

describe("ranking the providers for a guide", () => {
  it("orders by what arrives, and puts dated estimates after every current price", () => {
    const ranked = rankProviders(result([
      row("a", "Provider A", 92_000),
      row("estimate", "Estimate Co", 99_000, { basis: "market_estimate", observedAt: "2026-11-25T11:00:00Z" }),
      row("b", "Provider B", 93_000),
    ]), NOW);
    const slugs = ranked.map((provider) => provider.slug);
    expect(slugs.slice(0, 2)).toEqual(["b", "a"]);
    // A dated estimate never outranks a current price, however large it is.
    if (slugs.includes("estimate")) expect(slugs.at(-1)).toBe("estimate");
  });

  it("lists a provider once, keeps the best of its rows and caps the list", () => {
    const rows = Array.from({ length: 14 }, (_, index) => row(`p${index}`, `Provider ${index}`, 90_000 + index));
    rows.push(row("p3", "Provider 3 · second product", 95_000));
    const ranked = rankProviders(result(rows), NOW, 10);
    expect(ranked).toHaveLength(10);
    expect(ranked.filter((provider) => provider.slug === "p3")).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ slug: "p3", amount: 95_000 });
  });

  it("drops rows with no amount, and marks an offer as an offer", () => {
    const ranked = rankProviders(result([
      row("none", "No Price", null),
      row("promo", "Promo", 93_500, { publicOffer: { kind: "first_transfer", fundingMethod: "ACH", payoutMethod: "Bank account", displayUntil: "2026-11-26T12:00:00Z" } }),
    ]), NOW);
    expect(ranked.map((provider) => provider.slug)).toEqual(["promo"]);
    expect(ranked[0]).toMatchObject({ offer: true, label: "First-transfer offer" });
  });

  it("shows a cost only when every cost is known", () => {
    const ranked = rankProviders(result([row("known", "Known", 93_000), row("partial", "Partial", 92_000, { partial: true })]), NOW);
    expect(ranked.find((provider) => provider.slug === "known")!.costPct).toBe(0.01);
    expect(ranked.find((provider) => provider.slug === "partial")!.costPct).toBeNull();
  });

  it("gives a visitor the names in alphabetical order and nothing that reveals the ranking", () => {
    const ranked = rankProviders(result([row("z", "Zed", 94_000), row("a", "Alpha", 91_000), row("m", "Mid", 93_000)]), NOW);
    const listed = listedProviders(ranked);
    expect(listed.map((provider) => provider.name)).toEqual(["Alpha", "Mid", "Zed"]);
    for (const provider of listed) expect(Object.keys(provider).sort()).toEqual(["name", "slug"]);
  });
});
