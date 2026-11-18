import { describe, expect, it } from "vitest";
import { EXCHANGE_FEEDS, KNOWN_PROVIDER_SITES } from "@railor/core";
import { INDIA_EXCHANGES, depositSupport, exchangeBySlug, exchangeCharges, exchangesFor, fillBids, vdaTax } from "./india-exchanges";

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

describe("Indian exchanges", () => {
  it("lists the exchanges with fee sources and identifies those missing a bank payout price", () => {
    expect(INDIA_EXCHANGES.map((exchange) => exchange.slug)).toEqual(["coindcx", "wazirx", "giottus", "flitpay", "zebpay", "suncrypto", "mudrex", "koinbx"]);
    for (const exchange of INDIA_EXCHANGES) {
      expect(exchange.feeSource, exchange.slug).toMatch(/^https:\/\//);
      expect(exchange.withdrawalSource, exchange.slug).toMatch(/^https:\/\//);
      expect(exchange.tradeUrl("USDT"), exchange.slug).toMatch(/^https:\/\//);
      if (exchange.withdrawalFee !== null) expect(exchange.feeRate, exchange.slug).toBeGreaterThan(0);
      else expect(exchange.withdrawalNote, exchange.slug).toBeTruthy();
    }
  });

  it("prices USDC only where the exchange lists it against INR", () => {
    expect(exchangesFor("USDT")).toHaveLength(8);
    expect(exchangesFor("USDC").map((exchange) => exchange.slug)).toEqual(["coindcx", "wazirx", "koinbx"]);
  });

  it("every exchange either has a live feed read in core or says why it has none, never both", () => {
    const fed = new Set<string>(EXCHANGE_FEEDS.map((feed) => feed.slug));
    for (const exchange of INDIA_EXCHANGES) expect(fed.has(exchange.slug) !== Boolean(exchange.noLivePrice), exchange.slug).toBe(true);
    for (const slug of fed) expect(exchangeBySlug(slug), `${slug} is read but not listed`).toBeDefined();
    expect(INDIA_EXCHANGES.filter((exchange) => exchange.noLivePrice).map((exchange) => exchange.slug)).toEqual(["suncrypto", "mudrex"]);
    // The feeds that serve USDC are the exchanges that list USDC.
    for (const feed of EXCHANGE_FEEDS) expect(feed.assets.includes("USDC"), feed.slug).toBe(exchangesFor("USDC").some((exchange) => exchange.slug === feed.slug));
  });

  it("has a logo site registered for every exchange", () => {
    for (const exchange of INDIA_EXCHANGES) expect(KNOWN_PROVIDER_SITES[exchange.slug], exchange.slug).toMatch(/^https:\/\//);
  });

  it("Flitpay's published fee already includes GST, so none is added", () => {
    const flitpay = exchangeBySlug("flitpay")!;
    expect(flitpay.gstIncluded).toBe(true);
    // 0.50% of ₹1,02,330 = ₹511.65; TDS 1% of the ₹1,01,818.35 left; ₹10 standard withdrawal.
    expect(exchangeCharges(flitpay, 102_330)).toEqual({ gross: 102_330, tradingFee: 511.65, gst: 0, tds: 1018.18, withdrawalFee: 10, inBank: 100_790.17 });
  });

  it("Giottus, ZebPay and Mudrex: published fee plus GST, and their INR withdrawal", () => {
    expect(exchangeCharges(exchangeBySlug("giottus")!, 100_000)).toMatchObject({ tradingFee: 400, gst: 72, tds: 995.28, withdrawalFee: 0, inBank: 98_532.72 });
    expect(exchangeCharges(exchangeBySlug("zebpay")!, 100_000)).toMatchObject({ tradingFee: 450, gst: 81, withdrawalFee: 15 });
    expect(exchangeCharges(exchangeBySlug("mudrex")!, 100_000)).toMatchObject({ tradingFee: 1000, gst: 180, withdrawalFee: 0 });
  });

  it("takes USDT on the networks each exchange lists, and says so when it publishes none", () => {
    expect(depositSupport(exchangeBySlug("giottus")!, "USDT", "tron").status).toBe("yes");
    expect(depositSupport(exchangeBySlug("zebpay")!, "USDT", "ethereum").status).toBe("yes");
    expect(depositSupport(exchangeBySlug("giottus")!, "USDT", "solana").status).toBe("no");
    expect(depositSupport(exchangeBySlug("suncrypto")!, "USDT", "ethereum")).toMatchObject({ status: "unknown", note: expect.stringContaining("doesn’t publish") });
  });
});
