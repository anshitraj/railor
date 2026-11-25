import { describe, expect, it } from "vitest";
import type { PriceRow } from "@railor/core";
import { corridorRules, methodsFor, waysToSend } from "./ways-to-send";

const row = (slug: string, name: string, recipientAmount: number | null, over: Partial<PriceRow> = {}): PriceRow => ({
  providerSlug: slug, providerName: name, basis: "live_public", recipientAmount, feeAmount: 0, feeCurrency: "USD", rate: 92, totalCostPct: 0.5,
  partial: false, costComplete: true, delivery: null, observedAt: "2026-11-25T18:00:00Z", source: { label: "x" }, notes: [], ...over,
});

describe("waysToSend", () => {
  it("groups providers by how the money moves, in a fixed order, leaving empty groups out", () => {
    const groups = waysToSend({ from: "USD", to: "INR", rows: [
      row("wise", "Wise", 92_100), row("remitly", "Remitly", 92_300), row("market:remitly", "Remitly", 92_500, { basis: "market_estimate" }),
      row("market:chase", "Chase (US)", 90_100, { basis: "market_estimate" }), row("western-union", "Western Union", 91_000),
      row("skydo", "Skydo", null), row("blocked", "Blocked", 92_900, { profileAssessment: { status: "not_supported" } as PriceRow["profileAssessment"] }),
    ] });
    expect(groups.map((group) => group.id)).toEqual(["app", "online", "cash", "bank", "multi", "get_paid"]);
    const apps = groups.find((group) => group.id === "app")!;
    // Remitly appears once, with its strongest price; the best pick prefers a comparable price over an estimate.
    expect(apps.providers.filter((provider) => provider.slug === "remitly")).toHaveLength(1);
    expect(apps.best?.name).toBe("Remitly");
    expect(apps.best?.status).toBe("comparable");
    expect(groups.find((group) => group.id === "bank")?.best).toMatchObject({ name: "Chase (US)", status: "confirm" });
    expect(groups.find((group) => group.id === "get_paid")?.best).toBeNull();
  });

  it("attaches US and India cash rules to the cash group, with official sources", () => {
    const rules = corridorRules("USD", "INR");
    expect(rules.map((rule) => rule.source.url)).toEqual([expect.stringContaining("irs.gov"), expect.stringContaining("rbi.org.in")]);
    expect(corridorRules("GBP", "EUR")).toEqual([]);
    const cash = waysToSend({ from: "USD", to: "INR", rows: [row("moneygram", "MoneyGram", 91_000)] }).find((group) => group.id === "cash");
    expect(cash?.rules).toHaveLength(2);
  });

  it("knows a bank by name when it isn't in the list", () => {
    expect(methodsFor("market:state-bank-of-india", "State Bank of India")).toEqual(["bank"]);
    expect(methodsFor("market:unknown", "Some App")).toEqual([]);
  });
});
