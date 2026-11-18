import { describe, expect, it } from "vitest";
import { EXCHANGE_FEEDS, type ExchangeBid, type ExchangeRate, type UsdtInrExchangeRates } from "@railor/core";
import { EXCHANGES, estimateSale, exchangeBySlug } from "./indian-exchanges";
import { clockTime, isExchangeCard, liveView, rankExchangeCards, rupees, signedPercent, type LiveView, type RatesState } from "./exchange-live";
import { stablecoinRoutes } from "./stablecoin-routes";

const exchange = (slug: string) => exchangeBySlug(slug)!;

const ok = (slug: string, bid: number, over: Partial<ExchangeBid> = {}): ExchangeRate => ({
  status: "ok", slug: slug as ExchangeBid["slug"], bid, ask: bid + 0.5, observedAt: "2026-11-18T13:58:05.000Z", clock: "exchange",
  gapPct: Math.round((bid / 93.44 - 1) * 10_000) / 100, source: { label: `${slug} public data`, url: `https://example.test/${slug}` }, ...over,
});
const ready = (rates: Partial<Record<string, ExchangeRate>>): RatesState => ({
  status: "ready",
  data: { pair: "USDT/INR", reference: { rate: 93.44, source: "Wise's public rate (mid-market)", observedAt: "2026-11-18T13:58:00.000Z" }, rates: rates as UsdtInrExchangeRates["rates"], generatedAt: "2026-11-18T13:58:10.000Z" },
});
const card = (slug: string) => ({ id: `exchange-${slug}`, slug });

describe("estimating a sale from a live bid", () => {
  it("takes the published fee, GST and TDS off the sale, rounded to the paisa", () => {
    // WazirX: 0.40% plus GST. 1,000 USDT × ₹102.85 = ₹1,02,850.00
    expect(estimateSale(exchange("wazirx"), 1000, 102.85)).toEqual({ gross: 102850, fee: 411.4, gst: 74.05, tds: 1023.65, net: 101340.9 });
  });

  it("adds no GST where the published fee already includes it (Flitpay)", () => {
    expect(exchange("flitpay").gstIncluded).toBe(true);
    // 0.50% of ₹1,02,330 = ₹511.65, TDS 1% of the ₹1,01,818.35 left
    expect(estimateSale(exchange("flitpay"), 1000, 102.33)).toEqual({ gross: 102330, fee: 511.65, gst: 0, tds: 1018.18, net: 100800.17 });
  });

  it("scales with the amount and never treats USDT as 1:1", () => {
    const small = estimateSale(exchange("coindcx"), 10, 103)!;
    const big = estimateSale(exchange("coindcx"), 10_000, 103)!;
    expect(small.gross).toBe(1030);
    expect(big.gross).toBe(1_030_000);
    expect(big.net / small.net).toBeCloseTo(1000, 1);
    expect(small.net).toBeGreaterThan(900); // a ₹103 price, not 1 USDT = 1 USD ≈ ₹93.44
  });

  it("has no estimate without a usable amount or bid", () => {
    for (const [amount, bid] of [[0, 102], [-5, 102], [Number.NaN, 102], [100, 0], [100, -1], [100, Number.NaN], [100, Number.POSITIVE_INFINITY]]) {
      expect(estimateSale(exchange("wazirx"), amount!, bid!), `${amount} at ${bid}`).toBeNull();
    }
  });
});

describe("which exchanges have a live feed", () => {
  it("every exchange either has a feed read in core or says why it has none, never both", () => {
    const fed = new Set<string>(EXCHANGE_FEEDS.map((feed) => feed.slug));
    for (const item of EXCHANGES) {
      expect(fed.has(item.slug) !== Boolean(item.noLivePrice), `${item.slug}: feed ${fed.has(item.slug)}, reason ${Boolean(item.noLivePrice)}`).toBe(true);
    }
    for (const slug of fed) expect(exchangeBySlug(slug), `${slug} is read but not listed`).toBeDefined();
    expect(EXCHANGES.filter((item) => item.noLivePrice).map((item) => item.slug)).toEqual(["suncrypto", "mudrex"]);
  });
});

describe("the live slot on a route card", () => {
  const amount = 1000;
  const signedIn = true;

  it("is empty for anything that is not an Indian exchange", () => {
    for (const id of ["xflow-stablecoins", "xerof-payouts", "tether-redemption", "circle-mint"]) expect(liveView({ id, slug: "xflow" }, { signedIn, state: ready({}), amount })).toBeNull();
    expect(liveView({ id: "exchange-nowhere", slug: "nowhere" }, { signedIn, state: ready({}), amount })).toBeNull();
  });

  it("is locked for a visitor, and carries no number at all", () => {
    const view = liveView(card("wazirx"), { signedIn: false, state: ready({ wazirx: ok("wazirx", 102.85) }), amount });
    expect(view).toEqual({ kind: "locked" });
    expect(JSON.stringify(view)).not.toMatch(/\d/);
  });

  it("shows nothing for a visitor on an exchange that has no feed, since there is nothing to unlock", () => {
    expect(liveView(card("suncrypto"), { signedIn: false, state: { status: "idle", data: null }, amount })).toBeNull();
    expect(liveView(card("mudrex"), { signedIn: false, state: { status: "idle", data: null }, amount })).toBeNull();
  });

  it("explains an exchange with no feed to a signed-in user", () => {
    const sun = liveView(card("suncrypto"), { signedIn, state: ready({}), amount });
    expect(sun).toMatchObject({ kind: "no-feed", reason: expect.stringContaining("bid above its ask") });
    expect(liveView(card("mudrex"), { signedIn, state: ready({}), amount })).toMatchObject({ kind: "no-feed", reason: expect.stringContaining("futures") });
  });

  it("waits, and reports a failed read, for a signed-in user", () => {
    expect(liveView(card("wazirx"), { signedIn, state: { status: "idle", data: null }, amount })).toEqual({ kind: "loading" });
    expect(liveView(card("wazirx"), { signedIn, state: { status: "loading", data: null }, amount })).toEqual({ kind: "loading" });
    expect(liveView(card("wazirx"), { signedIn, state: { status: "error", data: null }, amount })).toEqual({ kind: "failed" });
  });

  it("carries the bid, the gap, the time and the estimate for the entered amount", () => {
    const view = liveView(card("wazirx"), { signedIn, state: ready({ wazirx: ok("wazirx", 102.85) }), amount: 1000 }) as Extract<LiveView, { kind: "ok" }>;
    expect(view.kind).toBe("ok");
    expect(view.bid).toMatchObject({ bid: 102.85, gapPct: 10.07, observedAt: "2026-11-18T13:58:05.000Z", clock: "exchange" });
    expect(view.reference).toMatchObject({ rate: 93.44 });
    expect(view.estimate).toEqual(estimateSale(exchange("wazirx"), 1000, 102.85));
    expect(view.fee).toEqual({ pct: 0.4, gstIncluded: false });
    const empty = liveView(card("wazirx"), { signedIn, state: ready({ wazirx: ok("wazirx", 102.85) }), amount: 0 }) as Extract<LiveView, { kind: "ok" }>;
    expect(empty.estimate).toBeNull();
    expect(empty.bid.bid).toBe(102.85);
  });

  it("passes an exchange's failed or rejected feed through with its reason", () => {
    const state = ready({ giottus: { status: "unavailable", slug: "giottus", problem: "rate_limited", detail: "Giottus asked Railor to slow down (HTTP 429)." } });
    expect(liveView(card("giottus"), { signedIn, state, amount })).toEqual({ kind: "unavailable", detail: "Giottus asked Railor to slow down (HTTP 429)." });
    expect(liveView(card("zebpay"), { signedIn, state, amount })).toMatchObject({ kind: "unavailable" });
  });
});

describe("ordering the exchange cards", () => {
  const routes = stablecoinRoutes("USDT", "ethereum", "INR", 1000);
  const views = (bids: Record<string, number>, amount = 1000) =>
    new Map(routes.map((route) => [route.id, liveView(route, { signedIn: true, state: ready(Object.fromEntries(Object.entries(bids).map(([slug, bid]) => [slug, ok(slug, bid)]))), amount })]));

  it("starts with the cheapest entry fee, as before any price is known", () => {
    const exchanges = routes.filter(isExchangeCard).map((route) => route.slug);
    expect(exchanges.slice(0, 3)).toEqual(["wazirx", "suncrypto", "giottus"].filter((slug) => exchanges.includes(slug)).slice(0, 3));
    expect(rankExchangeCards(routes, new Map()).map((route) => route.id)).toEqual(routes.map((route) => route.id));
  });

  it("puts the exchange that would leave the most INR first, even when its fee is higher", () => {
    // CoinDCX charges 0.50% + GST against WazirX's 0.40% + GST, but its bid is higher by far more than the fee gap.
    const ranked = rankExchangeCards(routes, views({ wazirx: 102.0, coindcx: 103.5, giottus: 101.9, zebpay: 103.3 }));
    const order = ranked.filter(isExchangeCard).map((route) => route.slug);
    expect(order.slice(0, 4)).toEqual(["coindcx", "zebpay", "wazirx", "giottus"]);
  });

  it("keeps exchanges without a price after the priced ones, in their fee order, and leaves every other route in place", () => {
    const ranked = rankExchangeCards(routes, views({ zebpay: 103.3, wazirx: 102.85 }));
    const ids = ranked.map((route) => route.id);
    const exchanges = ranked.filter(isExchangeCard).map((route) => route.slug);
    expect(exchanges.slice(0, 2)).toEqual(["zebpay", "wazirx"]);
    const unpriced = exchanges.slice(2);
    expect(unpriced).toEqual(routes.filter(isExchangeCard).map((route) => route.slug).filter((slug) => !["zebpay", "wazirx"].includes(slug)));
    const others = (list: string[]) => list.filter((id) => !id.startsWith("exchange-"));
    expect(others(ids)).toEqual(others(routes.map((route) => route.id)));
    expect(ids.findIndex((id) => id === "xflow-stablecoins")).toBe(routes.findIndex((route) => route.id === "xflow-stablecoins"));
  });
});

describe("formatting", () => {
  it("groups rupees the way the exchange cards already write them", () => {
    expect(rupees(101340.9)).toBe("₹1,01,341");
    expect(rupees(102.85, 2)).toBe("₹102.85");
    expect(rupees(1_030_000)).toBe("₹10,30,000");
  });

  it("signs the gap", () => {
    expect(signedPercent(10.07)).toBe("+10.07%");
    expect(signedPercent(-0.5)).toBe("−0.50%");
    expect(signedPercent(0)).toBe("0.00%");
  });

  it("writes the observation time, and nothing for a time that does not parse", () => {
    expect(clockTime("2026-11-18T13:58:05.000Z", "UTC")).toBe("13:58:05");
    expect(clockTime("2026-11-18T13:58:05.000Z", "Asia/Kolkata")).toBe("19:28:05");
    expect(clockTime("not a time")).toBe("");
  });
});
