import { describe, expect, it, vi } from "vitest";
import { indiaExchangeQuotes } from "./india-exchange-quotes";

vi.mock("server-only", () => ({}));

// Response shapes trimmed from real calls to each exchange's public endpoint on 2026-11-18,
// with timestamps re-based to this fixed clock.
const NOW = 1_795_010_290_000;
const deps = (fetcher: typeof fetch, extra: Record<string, unknown> = {}) => ({ fetcher, now: new Date(NOW), reference: { rate: 93.44 }, ...extra });

const books = {
  wazirx: { timestamp: NOW - 5_000, asks: [["103.39", "1877.83"]], bids: [["102.85", "3556.43"], ["102.7", "100"]] },
  coindcx: { timestamp: NOW - 2_000, asks: { "103.34": "683.03" }, bids: { "103.0": "4041.56", "102.92": "97.16" } },
  giottus: { bids: [["101.91", "522.6108"], ["101.90", "421.2715"], ["101.82", "1000"]], asks: [["103.97", "114"]] },
  zebpay: { data: { bids: [["103.309", "647.54"]], asks: [["103.431", "1014.68"]], timestamp: (NOW - 1_500) / 1000 }, statusCode: 200 },
  flitpay: [{ at: (NOW - 3_000) / 1000, symbol: "INR_USDT", "bid price": "102.33", ask_price: "102.44" }],
};

type Overrides = Partial<Record<keyof typeof books, () => Response>>;
function fetcherFor(overrides: Overrides = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const slug = (Object.keys(books) as Array<keyof typeof books>).find((name) => url.includes(`${name === "zebpay" ? "sapi.zebpay" : `api.${name}`}.`));
    if (!slug) return new Response("{}", { status: 503 });
    return overrides[slug]?.() ?? new Response(JSON.stringify(books[slug]), { status: 200 });
  }) as unknown as typeof fetch;
  return Object.assign(impl, { calls });
}

describe("quotes on the seven Indian exchanges", () => {
  it("prices every exchange that has a feed, best INR in the bank first, and keeps the rest with the reason", async () => {
    const { quotes, reference } = await indiaExchangeQuotes("USDT", "tron", 1000, deps(fetcherFor({ zebpay: () => new Response("<html>Attention Required</html>", { status: 403 }) })));
    expect(reference).toMatchObject({ rate: 93.44 });
    const bySlug = Object.fromEntries(quotes.map((quote) => [quote.slug, quote]));
    expect(quotes.map((quote) => quote.slug).slice(0, 4)).toEqual(["coindcx", "wazirx", "flitpay", "giottus"]);
    for (const slug of ["coindcx", "wazirx", "flitpay", "giottus"]) expect(bySlug[slug]!.status, slug).toBe("priced");
    expect(bySlug.zebpay).toMatchObject({ status: "unavailable", reason: expect.stringContaining("refuses requests from Railor’s server") });
    expect(bySlug.suncrypto).toMatchObject({ status: "unavailable", reason: expect.stringContaining("bid above its ask") });
    expect(bySlug.mudrex).toMatchObject({ status: "unavailable", reason: expect.stringContaining("futures markets only") });
    expect(quotes).toHaveLength(7);
  });

  it("walks the order book for the amount and carries the live bid, its time and its gap to Wise's mid-market", async () => {
    const { quotes } = await indiaExchangeQuotes("USDT", "tron", 1000, deps(fetcherFor()));
    const giottus = quotes.find((quote) => quote.slug === "giottus")!;
    // 522.6108 @ 101.91 + 421.2715 @ 101.90 + the rest @ 101.82
    const rest = 1000 - 522.6108 - 421.2715;
    const gross = 522.6108 * 101.91 + 421.2715 * 101.9 + rest * 101.82;
    expect(giottus.fill!.gross).toBeCloseTo(gross, 1);
    expect(giottus.fill!.bestBid).toBe(101.91);
    expect(giottus.fill!.averagePrice).toBeLessThan(101.91);
    expect(giottus.live).toMatchObject({ bid: 101.91, ask: 103.97, depth: "book", clock: "railor", gapPct: 9.06, referenceRate: 93.44 });
    const coindcx = quotes.find((quote) => quote.slug === "coindcx")!;
    expect(coindcx.live).toMatchObject({ bid: 103, clock: "exchange", observedAt: new Date(NOW - 2_000).toISOString(), gapPct: 10.23 });
    expect(coindcx.breakdown!.gross).toBe(103_000);
  });

  it("prices a feed with only a best bid (Flitpay) at that bid for the whole amount, adds no GST, and says it was not walked", async () => {
    const { quotes } = await indiaExchangeQuotes("USDT", "ethereum", 50_000, deps(fetcherFor()));
    const flitpay = quotes.find((quote) => quote.slug === "flitpay")!;
    expect(flitpay.live).toMatchObject({ depth: "top", bid: 102.33 });
    expect(flitpay.fill).toMatchObject({ filled: 50_000, gross: 5_116_500, averagePrice: 102.33, short: false });
    expect(flitpay.breakdown).toMatchObject({ gst: 0, tradingFee: 25_582.5, withdrawalFee: 10 });
    // Above Flitpay's ₹5,00,000 per withdrawal.
    expect(flitpay.aboveMaximum).toBe(true);
  });

  it("flags a book too thin for the amount", async () => {
    const { quotes } = await indiaExchangeQuotes("USDT", "ethereum", 50_000, deps(fetcherFor()));
    expect(quotes.find((quote) => quote.slug === "giottus")!.fill!.short).toBe(true);
    const wazirx = quotes.find((quote) => quote.slug === "wazirx")!.fill!;
    expect(wazirx.short).toBe(true);
    expect(wazirx.filled).toBeCloseTo(3656.43, 6);
  });

  it("USDC is priced on CoinDCX and WazirX only, from their USDC markets", async () => {
    const fetcher = fetcherFor();
    const { quotes } = await indiaExchangeQuotes("USDC", "ethereum", 1000, deps(fetcher));
    expect(quotes.map((quote) => quote.slug).sort()).toEqual(["coindcx", "wazirx"]);
    expect(fetcher.calls.sort()).toEqual([
      "https://api.coindcx.com/market_data/orderbook?pair=I-USDC_INR",
      "https://api.wazirx.com/sapi/v1/depth?symbol=usdcinr&limit=100",
    ]);
  });

  it("survives every exchange failing: all seven stay listed as unavailable", async () => {
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const { quotes, reference } = await indiaExchangeQuotes("USDT", "tron", 1000, { fetcher: down, now: new Date(NOW) });
    expect(reference).toBeNull();
    expect(quotes).toHaveLength(7);
    expect(quotes.every((quote) => quote.status === "unavailable" && quote.reason)).toBe(true);
  });

  it("rejects a crossed or absurd book instead of pricing it", async () => {
    const crossed = { timestamp: NOW, asks: [["100.9", "10"]], bids: [["103.9", "10"]] };
    const { quotes } = await indiaExchangeQuotes("USDT", "tron", 10, deps(fetcherFor({ wazirx: () => new Response(JSON.stringify(crossed)) })));
    expect(quotes.find((quote) => quote.slug === "wazirx")).toMatchObject({ status: "unavailable", reason: expect.stringContaining("bid above its ask") });
  });
});
