import { describe, expect, it } from "vitest";
import { comparePrices, publicMidMarketRate } from "../index.js";

const NOW = new Date("2026-11-25T10:00:00Z");

const frankfurter = (rate: unknown) => JSON.stringify([{ date: "2026-11-25", base: "USD", quote: "SAR", rate }]);
const snapshot = (rate: unknown) => JSON.stringify({ date: "2026-11-24", usd: { sar: rate } });

/** A fetcher that answers per host, and counts what it was asked. */
function sources(answers: { frankfurter?: () => Response | Promise<Response>; cdn?: () => Response | Promise<Response>; mirror?: () => Response | Promise<Response> }) {
  const asked: string[] = [];
  const fetcher = (async (url: string | URL) => {
    const target = String(url);
    asked.push(target);
    const answer = target.includes("frankfurter") ? answers.frankfurter : target.includes("jsdelivr") ? answers.cdn : target.includes("currency-api.pages.dev") ? answers.mirror : undefined;
    if (!answer) throw new Error("unreachable");
    return answer();
  }) as typeof fetch;
  return { fetcher, asked };
}

describe("the independent mid-market rate", () => {
  it("reads the day's rate and says where it came from and which day", async () => {
    const { fetcher } = sources({ frankfurter: () => new Response(frankfurter(3.75)) });
    const rate = await publicMidMarketRate("USD", "SAR", fetcher, NOW);
    expect(rate).toEqual({ rate: 3.75, source: "Daily mid-market rate from Frankfurter, 25 Nov", observedAt: NOW.toISOString() });
  });

  it("falls back to the daily snapshot when Frankfurter is down", async () => {
    const { fetcher } = sources({ frankfurter: () => new Response("nope", { status: 503 }), cdn: () => new Response(snapshot(3.75)) });
    const rate = await publicMidMarketRate("USD", "SAR", fetcher, NOW);
    expect(rate).toMatchObject({ rate: 3.75, source: "Daily mid-market rate from public daily rates, 24 Nov" });
  });

  it("tries the snapshot's mirror when its first address fails", async () => {
    const { fetcher, asked } = sources({ frankfurter: () => new Response("{}", { status: 500 }), cdn: () => new Response("nope", { status: 500 }), mirror: () => new Response(snapshot(3.7501)) });
    expect(await publicMidMarketRate("USD", "SAR", fetcher, NOW)).toMatchObject({ rate: 3.7501 });
    expect(asked.some((url) => url.includes("currency-api.pages.dev"))).toBe(true);
  });

  it("returns nothing, rather than a guess, when no source has the pair or the figure is not a rate", async () => {
    expect(await publicMidMarketRate("USD", "SAR", sources({}).fetcher, NOW)).toBeNull();
    for (const bad of [0, -3.75, "3.75", null, Number.NaN]) {
      const { fetcher } = sources({ frankfurter: () => new Response(frankfurter(bad)), cdn: () => new Response(snapshot(bad)), mirror: () => new Response(snapshot(bad)) });
      expect(await publicMidMarketRate("USD", "SAR", fetcher, NOW), String(bad)).toBeNull();
    }
  });

  it("never asks about the same currency twice or an invalid code", async () => {
    const { fetcher, asked } = sources({ frankfurter: () => new Response(frankfurter(3.75)) });
    expect(await publicMidMarketRate("USD", "USD", fetcher, NOW)).toBeNull();
    expect(await publicMidMarketRate("usd", "SAR", fetcher, NOW)).toBeNull();
    expect(await publicMidMarketRate("USD", "SARX", fetcher, NOW)).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("a price check for a pair Wise can't quote", () => {
  const down = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
  const input = { sourceCurrency: "USD", destinationCurrency: "SAR", amount: 1000, includeMarket: true };

  it("still has a benchmark, labelled as an independent daily mid-market rate", async () => {
    const { fetcher } = sources({ frankfurter: () => new Response(frankfurter(3.75)) });
    const result = await comparePrices(input, { fetcher: down, fallbackFetcher: fetcher, now: NOW });
    expect(result.reference).toEqual({ rate: 3.75, source: "Daily mid-market rate from Frankfurter, 25 Nov", observedAt: NOW.toISOString() });
    // Wise is still reported as having no quote: the benchmark never stands in for a provider's price.
    expect(result.rows.some((row) => row.providerSlug === "wise")).toBe(false);
    expect(result.unavailable.find((item) => item.providerSlug === "wise")?.reason).toMatch(/No public quote/);
  });

  it("has no benchmark when the independent sources are down too, instead of inventing one", async () => {
    const result = await comparePrices(input, { fetcher: down, fallbackFetcher: sources({}).fetcher, now: NOW });
    expect(result.reference).toBeNull();
  });

  it("leaves an injected test fetcher alone: with no fallback fetcher the network is never asked", async () => {
    let calls = 0;
    const counting = (async () => { calls += 1; return new Response("{}", { status: 404 }); }) as unknown as typeof fetch;
    const withFallback = await comparePrices(input, { fetcher: counting, now: NOW });
    const first = calls;
    expect(withFallback.reference).toBeNull();
    // Same call count as a run where the fallback is explicitly off.
    calls = 0;
    await comparePrices(input, { fetcher: counting, fallbackFetcher: undefined, now: NOW });
    expect(calls).toBe(first);
  });
});
