import { describe, expect, it } from "vitest";
import { routeQuote, type RoutableProvider } from "../routing.js";
import type { UnifiedQuote } from "../unified.js";

const BASE_REQUEST = { sourceAsset: "USDC", destinationCurrency: "MXN", amount: 1000 };

function quote(overrides: Partial<UnifiedQuote> & { providerSlug: string }): UnifiedQuote {
  return {
    sourceAsset: "USDC",
    destinationCurrency: "MXN",
    amount: 1000,
    costPartial: false,
    quoteType: "live",
    accountContext: "customer_connected",
    verificationType: "provider_verified",
    observedAt: new Date().toISOString(),
    quotedAt: new Date().toISOString(),
    ...overrides,
  };
}

function providerWithQuote(slug: string, q: Partial<UnifiedQuote>, healthOkRatio: number | null = null): RoutableProvider {
  return {
    slug,
    name: slug,
    healthOkRatio,
    credentials: { apiKey: "test" },
    adapter: {
      slug,
      credentialFields: [],
      testConnection: async () => ({ ok: true, detail: "ok" }),
      getQuote: async () => quote({ ...q, providerSlug: slug }),
    },
  };
}

function skippedProvider(slug: string, reason: "no_adapter" | "no_credentials"): RoutableProvider {
  return {
    slug,
    name: slug,
    credentials: reason === "no_credentials" ? null : { apiKey: "test" },
    adapter:
      reason === "no_adapter"
        ? null
        : {
            slug,
            credentialFields: [],
            testConnection: async () => ({ ok: true, detail: "ok" }),
            getQuote: async () => quote({ providerSlug: slug }),
          },
  };
}

function failingProvider(slug: string, message: string): RoutableProvider {
  return {
    slug,
    name: slug,
    credentials: { apiKey: "test" },
    adapter: {
      slug,
      credentialFields: [],
      testConnection: async () => ({ ok: true, detail: "ok" }),
      getQuote: async () => {
        throw new Error(message);
      },
    },
  };
}

describe("routeQuote", () => {
  it("never lets a partial-cost quote outrank a confirmed-total quote just because its known fee is smaller", async () => {
    const providers = [
      providerWithQuote("partial-co", { feeAmount: 5, costPartial: true }),
      providerWithQuote("complete-co", { feeAmount: 10, costPartial: false }),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "cheapest");
    expect(result.selected?.providerSlug).toBe("complete-co");
  });

  it("cheapest sorts confirmed-total quotes by fee ascending and reports full confidence", async () => {
    const providers = [
      providerWithQuote("expensive", { feeAmount: 20, costPartial: false }),
      providerWithQuote("cheap", { feeAmount: 5, costPartial: false }),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "cheapest");
    expect(result.selected?.providerSlug).toBe("cheap");
    expect(result.rankingConfidence).toBe(1);
    expect(result.rankingInputsUsed).toEqual(["cost"]);
    expect(result.rankingInputsMissing).toEqual([]);
  });

  it("max_recipient_amount sorts by recipientAmount descending and puts unknown-recipient quotes last", async () => {
    const providers = [
      providerWithQuote("unknown-recipient", { feeAmount: 1, costPartial: false }),
      providerWithQuote("low", { recipientAmount: 900 }),
      providerWithQuote("high", { recipientAmount: 950 }),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "max_recipient_amount");
    expect(result.selected?.providerSlug).toBe("high");
    // Ranked last for missing the ranked dimension, not excluded as an error.
    const unknownAttempt = result.attempts.find((a) => a.providerSlug === "unknown-recipient");
    expect(unknownAttempt?.outcome).toBe("quoted");
  });

  it("fastest sorts by ETA ascending and puts unknown-ETA quotes last", async () => {
    const providers = [
      providerWithQuote("no-eta", {}),
      providerWithQuote("slow", { estimatedArrivalMinutes: 120 }),
      providerWithQuote("fast", { estimatedArrivalMinutes: 5 }),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "fastest");
    expect(result.selected?.providerSlug).toBe("fast");
  });

  it("most_reliable sorts by provider health descending, from RoutableProvider not the quote", async () => {
    const providers = [
      providerWithQuote("unranked", {}, null),
      providerWithQuote("shaky", {}, 0.7),
      providerWithQuote("solid", {}, 0.99),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "most_reliable");
    expect(result.selected?.providerSlug).toBe("solid");
    expect(result.rankingInputsUsed).toEqual(["reliability"]);
  });

  it("balanced blends only the dimensions actually known, never defaulting a missing one to a fabricated midpoint", async () => {
    const providers = [
      // No ETA at all, but the cheapest and most reliable of the two.
      providerWithQuote("cheap-reliable-no-eta", { feeAmount: 1, costPartial: false }, 0.99),
      // Has every dimension, but worse on each than the other candidate.
      providerWithQuote("mediocre-everything", { feeAmount: 50, costPartial: false, estimatedArrivalMinutes: 500 }, 0.5),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "balanced");
    expect(result.selected?.providerSlug).toBe("cheap-reliable-no-eta");
  });

  it("records skip reasons without ever selecting a skipped or failed provider", async () => {
    const providers = [
      skippedProvider("no-adapter-co", "no_adapter"),
      skippedProvider("not-connected-co", "no_credentials"),
      failingProvider("errors-co", "upstream 500"),
    ];
    const result = await routeQuote(providers, BASE_REQUEST, "balanced");
    expect(result.selected).toBeNull();
    expect(result.rankingConfidence).toBe(0);
    expect(result.rankingInputsUsed).toEqual([]);
    const bySlug = Object.fromEntries(result.attempts.map((a) => [a.providerSlug, a]));
    expect(bySlug["no-adapter-co"]!.outcome).toBe("skipped");
    expect(bySlug["no-adapter-co"]!.detail).toMatch(/no quote support/i);
    expect(bySlug["not-connected-co"]!.outcome).toBe("skipped");
    expect(bySlug["not-connected-co"]!.detail).toMatch(/not connected/i);
    expect(bySlug["errors-co"]!.outcome).toBe("failed");
    expect(bySlug["errors-co"]!.detail).toBe("upstream 500");
  });
});
