import { describe, expect, it } from "vitest";
import { depositSupport, exchangeBySlug, exchangeCharges, fillBids, indiaExchangeQuotes, vdaTax } from "./india-exchanges";

const coindcx = exchangeBySlug("coindcx")!;
const wazirx = exchangeBySlug("wazirx")!;

describe("order book fills", () => {
  it("walks the bids best first, so a big sale gets the price it would really fill at", () => {
    const fill = fillBids([[102.4, 500], [102.86, 300], [102.6, 1000]], 1000)!;
    // 300 @ 102.86 + 700 @ 102.60
    expect(fill.gross).toBe(102_678);
    expect(fill.bestBid).toBe(102.86);
    expect(fill.averagePrice).toBeCloseTo(102.678, 6);
    expect(fill.short).toBe(false);
  });

  it("flags a book too thin for the amount", () => {
    const fill = fillBids([[100, 10]], 25)!;
    expect(fill).toMatchObject({ filled: 10, gross: 1000, short: true });
  });

  it("returns nothing for an empty book", () => {
    expect(fillBids([], 100)).toBeNull();
    expect(fillBids([[0, 5]], 100)).toBeNull();
  });
});

describe("exchange charges and TDS", () => {
  it("CoinDCX: 0.50% fee + 18% GST, TDS on the net, free INR withdrawal", () => {
    expect(exchangeCharges(coindcx, 100_000)).toEqual({ gross: 100_000, tradingFee: 500, gst: 90, tds: 994.1, withdrawalFee: 0, inBank: 98_415.9 });
  });

  it("WazirX: 0.40% fee + GST, ₹10 withdrawal", () => {
    expect(exchangeCharges(wazirx, 100_000)).toEqual({ gross: 100_000, tradingFee: 400, gst: 72, tds: 995.28, withdrawalFee: 10, inBank: 98_522.72 });
  });
});

describe("tax on the sale", () => {
  const sale = exchangeCharges(coindcx, 100_000);

  it("taxes the whole sale at 31.2% when no cost is given, and credits the TDS", () => {
    expect(vdaTax(sale, null)).toEqual({ gain: 100_000, tax: 31_200, balance: 30_205.9, afterTax: 68_210, worstCase: true });
  });

  it("taxes only the gain over cost; fees don't reduce it", () => {
    const tax = vdaTax(sale, 99_000);
    expect(tax).toMatchObject({ gain: 1000, tax: 312, worstCase: false });
    // TDS (₹994.10) covers more than the tax: the extra comes back when you file.
    expect(tax.balance).toBe(-682.1);
    expect(tax.afterTax).toBe(99_098);
  });

  it("never taxes a loss", () => {
    expect(vdaTax(sale, 120_000)).toMatchObject({ gain: 0, tax: 0 });
  });
});

describe("deposit networks", () => {
  it("WazirX takes USDT only on Ethereum and Tron, so Arc is a clear no", () => {
    expect(depositSupport(wazirx, "USDT", "ethereum").status).toBe("yes");
    expect(depositSupport(wazirx, "USDT", "tron").status).toBe("yes");
    expect(depositSupport(wazirx, "USDT", "arc")).toMatchObject({ status: "no", note: expect.stringContaining("only on Ethereum") });
    expect(depositSupport(wazirx, "USDC", "base").status).toBe("unknown");
  });

  it("CoinDCX lists its chains; Tron is unconfirmed and Arc isn't listed", () => {
    expect(depositSupport(coindcx, "USDC", "base").status).toBe("yes");
    expect(depositSupport(coindcx, "USDT", "tron").status).toBe("unknown");
    expect(depositSupport(coindcx, "USDC", "arc").status).toBe("no");
  });
});

describe("live quotes", () => {
  it("ranks by INR in the bank and survives one exchange failing", async () => {
    const fetcher = (async (url: string) => {
      if (url.includes("coindcx")) return new Response(JSON.stringify({ bids: { "103": "5000", "102": "5000" } }));
      return new Response("down", { status: 503 });
    }) as unknown as typeof fetch;
    const quotes = await indiaExchangeQuotes("USDT", "ethereum", 1000, fetcher);
    expect(quotes.map((quote) => [quote.slug, quote.status])).toEqual([["coindcx", "priced"], ["wazirx", "unavailable"]]);
    expect(quotes[0]!.breakdown!.gross).toBe(103_000);
  });
});
