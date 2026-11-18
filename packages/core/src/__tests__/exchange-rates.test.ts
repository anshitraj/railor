import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXCHANGE_FEEDS, MAX_BID_AGE_MS, PUBLIC_FEED_USER_AGENT, inrExchangeRates, type ExchangeAsset, type ExchangeFeedSlug, type ExchangeRate, type InrExchangeRates } from "../public-pricing/exchange-rates.js";
import { clearSharedCache } from "../public-pricing/shared-cache.js";

// Response shapes are trimmed from real calls to each exchange's public endpoint on 2026-11-18;
// their timestamps are re-based to this fixed clock so the tests don't age.
const NOW = 1_795_010_290_000;
const REFERENCE = { rate: 93.44 };

const wazirx = (over: Record<string, unknown> = {}) => ({
  timestamp: NOW - 5_000,
  asks: [["103.43", "312.56"], ["103.39", "1877.83"], ["103.9", "3176.94"]],
  bids: [["102.7", "100"], ["102.85", "3556.43"], ["102.0", "50"]],
  ...over,
});
const coindcx = (over: Record<string, unknown> = {}) => ({
  timestamp: NOW - 2_000,
  asks: { "103.3400000000": "683.030000", "103.3700000000": "512.270000", "103.3900000000": "34102.320000" },
  bids: { "102.6600000000": "2248.070000", "103.0000000000": "4041.560000", "102.9200000000": "97.160000" },
  ...over,
});
const giottus = (over: Record<string, unknown> = {}) => ({
  bids: [["101.91", "522.6108"], ["101.90", "421.2715"], ["101.82", "1000.0000"]],
  asks: [["103.97", "114.0000"], ["103.98", "32400.7681"]],
  ...over,
});
const zebpay = (over: Record<string, unknown> = {}) => ({
  data: { nonce: 25951636, bids: [["103.3", "144.441142"], ["103.309", "647.54401"]], asks: [["103.431", "1014.682849"], ["103.437", "1156.26202"]], timestamp: (NOW - 1_500) / 1000, ...over },
  statusCode: 200, statusDescription: "Success",
});
const flitpay = (row: Record<string, unknown> = {}) => [
  { at: (NOW - 3_000) / 1000, symbol: "INR_XRP", base_coin: "INR", trade_unit: "XRP", "bid price": "", ask_price: "", Last_price: "32.4" },
  { at: (NOW - 3_000) / 1000, symbol: "INR_USDT", base_coin: "INR", trade_unit: "USDT", "bid price": "102.33000000", ask_price: "102.44000000", Last_price: "102.43000000", ...row },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const HOSTS: Record<string, ExchangeFeedSlug> = { "api.wazirx.com": "wazirx", "api.coindcx.com": "coindcx", "api.giottus.com": "giottus", "sapi.zebpay.com": "zebpay", "api.flitpay.com": "flitpay" };

type Answer = unknown | (() => Response | Promise<Response>);
/** A fetch that answers each exchange's host with a body (or a function building the response) and records every call. */
function exchangeFetch(overrides: Partial<Record<ExchangeFeedSlug, Answer>> = {}) {
  const answers: Record<ExchangeFeedSlug, Answer> = { wazirx: wazirx(), coindcx: coindcx(), giottus: giottus(), zebpay: zebpay(), flitpay: flitpay(), ...overrides };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const slug = Object.entries(HOSTS).find(([host]) => url.includes(host))?.[1];
    if (!slug) return new Response("{}", { status: 503 });
    const answer = answers[slug];
    return typeof answer === "function" ? (answer as () => Response | Promise<Response>)() : json(answer);
  });
  return Object.assign(impl as unknown as typeof fetch, { calls, impl });
}

/** Every exchange is present in a USDT result, so tests can index by slug. */
type Full = Omit<InrExchangeRates, "rates"> & { rates: Record<ExchangeFeedSlug, ExchangeRate> };
const full = async (result: Promise<InrExchangeRates>) => (await result) as unknown as Full;
const run = (fetcher: typeof fetch, extra: Record<string, unknown> = {}, asset: ExchangeAsset = "USDT") => full(inrExchangeRates(asset, { fetcher, now: new Date(NOW), reference: REFERENCE, ...extra }));

beforeEach(() => {
  clearSharedCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live USDT/INR prices from each exchange's own endpoint", () => {
  it("reads the best bid, the ask, the observation time and the gap to Wise's mid-market rate", async () => {
    const { rates, reference, pair } = await run(exchangeFetch());
    expect(pair).toBe("USDT/INR");
    expect(reference).toMatchObject({ rate: 93.44, source: "Wise's public rate (mid-market)" });
    expect(rates.wazirx).toMatchObject({ status: "ok", bid: 102.85, ask: 103.39, clock: "exchange", depth: "book", gapPct: 10.07, observedAt: new Date(NOW - 5_000).toISOString() });
    // The book comes back best bid first, to be walked for the amount sold.
    expect((rates.wazirx as { bids: unknown }).bids).toEqual([[102.85, 3556.43], [102.7, 100], [102, 50]]);
    expect(rates.coindcx).toMatchObject({ status: "ok", bid: 103, ask: 103.34, clock: "exchange", depth: "book", gapPct: 10.23, observedAt: new Date(NOW - 2_000).toISOString() });
    expect(rates.zebpay).toMatchObject({ status: "ok", bid: 103.309, ask: 103.431, clock: "exchange", depth: "book", gapPct: 10.56, observedAt: new Date(NOW - 1_500).toISOString() });
    // Flitpay's ticker has no sizes: only the best bid is known, and nothing is offered to walk.
    expect(rates.flitpay).toMatchObject({ status: "ok", bid: 102.33, ask: 102.44, clock: "exchange", depth: "top", bids: [], gapPct: 9.51, observedAt: new Date(NOW - 3_000).toISOString() });
  });

  it("shows Railor's own read time where the exchange sends none (Giottus's order book has no timestamp)", async () => {
    const { rates } = await run(exchangeFetch());
    expect(rates.giottus).toMatchObject({ status: "ok", bid: 101.91, ask: 103.97, clock: "railor", depth: "book", gapPct: 9.06, observedAt: new Date(NOW).toISOString() });
  });

  it("cites each exchange's own documentation for the number", async () => {
    const { rates } = await run(exchangeFetch());
    const links = Object.values(rates).map((rate) => rate.status === "ok" && new URL(rate.source.url).hostname);
    expect(links).toEqual(["docs.wazirx.com", "docs.coindcx.com", "api.giottus.com", "github.com", "api.flitpay.com"]);
    expect(EXCHANGE_FEEDS.map((feed) => new URL(feed.endpoint).protocol)).toEqual(Array(5).fill("https:"));
  });

  it("takes the best level of an unsorted book and ignores levels with no size", async () => {
    const { rates } = await run(exchangeFetch({
      coindcx: coindcx({ bids: { "99.0": "10", "103.5": "0", "103.0": "5", "bad": "5" }, asks: { "103.34": "0", "103.4": "3", "103.9": "1" } }),
      giottus: giottus({ bids: [["101.5", "1"], ["101.95", "2"], ["104", "0"], ["x", "9"]], asks: [["103.97", "114"], ["103.5", "0.5"]] }),
    }));
    expect(rates.coindcx).toMatchObject({ status: "ok", bid: 103, ask: 103.4, bids: [[103, 5], [99, 10]] });
    expect(rates.giottus).toMatchObject({ status: "ok", bid: 101.95, ask: 103.5 });
  });

  it("accepts a timestamp in seconds or in milliseconds (WazirX documents one and sends the other)", async () => {
    const seconds = await run(exchangeFetch({ wazirx: wazirx({ timestamp: Math.floor((NOW - 5_000) / 1000) }) }));
    expect(seconds.rates.wazirx).toMatchObject({ status: "ok", observedAt: new Date(Math.floor((NOW - 5_000) / 1000) * 1000).toISOString() });
    const millis = await run(exchangeFetch({ wazirx: wazirx({ timestamp: String(NOW - 5_000) }) }));
    expect(millis.rates.wazirx).toMatchObject({ status: "ok", observedAt: new Date(NOW - 5_000).toISOString() });
  });

  it("reads Flitpay's bid from its key with a space, and keeps a bid whose ask is empty", async () => {
    const { rates } = await run(exchangeFetch({ flitpay: flitpay({ ask_price: "" }) }));
    expect(rates.flitpay).toMatchObject({ status: "ok", bid: 102.33, ask: null });
  });

  it("measures the gap against Wise's mid-market rate when no reference is injected, and shows none when Wise fails", async () => {
    const wiseQuote = { rate: 93.44, sourceCurrency: "USD", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1000, targetAmount: 92_380, fee: { total: 11.26 } }] };
    const withWise = exchangeFetch();
    const routed = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => (String(input) === "https://api.wise.com/v3/quotes" ? json(wiseQuote) : withWise(input, init)));
    const ok = await full(inrExchangeRates("USDT", { fetcher: routed as unknown as typeof fetch, now: new Date(NOW) }));
    expect(ok.reference).toMatchObject({ rate: 93.44, source: "Wise's public rate (mid-market)" });
    expect(ok.rates.wazirx).toMatchObject({ status: "ok", gapPct: 10.07 });

    const withoutWise = await full(inrExchangeRates("USDT", { fetcher: exchangeFetch(), now: new Date(NOW) }));
    expect(withoutWise.reference).toBeNull();
    expect(withoutWise.rates.wazirx).toMatchObject({ status: "ok", bid: 102.85, gapPct: null });
  });
});

describe("strict validation", () => {
  const verdict = async (slug: ExchangeFeedSlug, body: unknown, extra: Record<string, unknown> = {}) => (await run(exchangeFetch({ [slug]: body }), extra)).rates[slug];
  /** A WazirX book with one level each side. */
  const wz = (bid: string | null, ask: string | null, over: Record<string, unknown> = {}) => wazirx({ bids: bid === null ? [] : [[bid, "100"]], asks: ask === null ? [] : [[ask, "100"]], ...over });

  it("rejects a bid that is zero, negative, empty or not a number, or has no size", async () => {
    for (const bid of ["0.0", "0", "-102.85", "", "n/a"]) {
      expect(await verdict("wazirx", wz(bid, "103.4")), `bid ${bid}`).toMatchObject({ status: "unavailable", problem: "invalid_price" });
    }
    expect(await verdict("wazirx", wazirx({ bids: [["102.85", "0"]] }))).toMatchObject({ status: "unavailable", problem: "invalid_price" });
    expect(await verdict("coindcx", coindcx({ bids: {} }))).toMatchObject({ status: "unavailable", problem: "invalid_price" });
    expect(await verdict("giottus", giottus({ bids: [] }))).toMatchObject({ status: "unavailable", problem: "invalid_price" });
    expect(await verdict("flitpay", flitpay({ "bid price": "0.00000000" }))).toMatchObject({ status: "unavailable", problem: "invalid_price" });
  });

  it("rejects a crossed quote, a bid above its own ask", async () => {
    const crossed = await verdict("wazirx", wz("103.9", "100.9"));
    expect(crossed).toMatchObject({ status: "unavailable", problem: "crossed" });
    expect(crossed.status === "unavailable" && crossed.detail).toContain("bid above its ask");
    // A locked book (bid equal to ask) is odd but not crossed.
    expect(await verdict("wazirx", wz("103.0", "103.0"))).toMatchObject({ status: "ok", bid: 103 });
  });

  it("rejects an absurd price: a decimal slip against the mid-market rate, or outside any sane band without one", async () => {
    for (const bid of ["1028.5", "10.285", "0.0097", "300"]) {
      expect(await verdict("wazirx", wz(bid, "5000")), `bid ${bid}`).toMatchObject({ status: "unavailable", problem: "out_of_range" });
    }
    expect(await verdict("wazirx", wz("1028.5", "1034"), { reference: null })).toMatchObject({ problem: "out_of_range" });
    expect(await verdict("wazirx", wz("10.285", "10.34"), { reference: null })).toMatchObject({ problem: "out_of_range" });
    // Without a reference a normal price still passes, with no gap.
    expect(await verdict("wazirx", wazirx(), { reference: null })).toMatchObject({ status: "ok", gapPct: null });
    // A premium well above today's roughly 10% is still real.
    expect(await verdict("wazirx", wz("115", "116"))).toMatchObject({ status: "ok", bid: 115 });
  });

  it("rejects a stale exchange timestamp, and one ahead of the clock", async () => {
    const stale = await verdict("wazirx", wazirx({ timestamp: NOW - MAX_BID_AGE_MS - 1_000 }));
    expect(stale).toMatchObject({ status: "unavailable", problem: "stale" });
    expect(await verdict("coindcx", coindcx({ timestamp: NOW - 10 * 60_000 }))).toMatchObject({ problem: "stale" });
    expect(await verdict("flitpay", flitpay({ at: (NOW - 3 * 60_000) / 1000 }))).toMatchObject({ problem: "stale" });
    expect(await verdict("zebpay", zebpay({ timestamp: (NOW - 10 * 60_000) / 1000 }))).toMatchObject({ problem: "stale" });
    expect(await verdict("wazirx", wazirx({ timestamp: NOW - MAX_BID_AGE_MS + 5_000 }))).toMatchObject({ status: "ok" });
    expect(await verdict("wazirx", wazirx({ timestamp: NOW + 5 * 60_000 }))).toMatchObject({ status: "unavailable", problem: "stale", detail: expect.stringContaining("ahead of the clock") });
    // A little clock skew is tolerated and never dates a price in the future.
    expect(await verdict("wazirx", wazirx({ timestamp: NOW + 20_000 }))).toMatchObject({ status: "ok", observedAt: new Date(NOW).toISOString() });
  });

  it("rejects a response that is not the expected market", async () => {
    expect(await verdict("wazirx", [wazirx()])).toMatchObject({ problem: "unreadable" });
    expect(await verdict("wazirx", { timestamp: NOW, bids: {}, asks: {} })).toMatchObject({ problem: "unreadable" });
    expect(await verdict("coindcx", { timestamp: NOW, bids: [["103", "1"]], asks: [] })).toMatchObject({ problem: "unreadable" });
    expect(await verdict("giottus", { bids: {}, asks: {} })).toMatchObject({ problem: "unreadable" });
    expect(await verdict("zebpay", { data: [{ symbol: "ETH-INR", bid: "1", ask: "2" }] })).toMatchObject({ problem: "unreadable" });
    expect(await verdict("zebpay", { data: "nope" })).toMatchObject({ problem: "unreadable" });
    expect(await verdict("flitpay", [])).toMatchObject({ problem: "unreadable" });
    expect(await verdict("flitpay", { code: 400, message: "please enter a valid symbol value" })).toMatchObject({ problem: "unreadable" });
  });
});

describe("a feed that fails never takes the page down", () => {
  it("turns every failure into an unavailable entry with a reason, and the other exchanges still answer", async () => {
    const html = () => new Response("<!DOCTYPE html><title>Attention Required! | Cloudflare</title>", { status: 403 });
    const { rates } = await run(exchangeFetch({
      wazirx: html,
      coindcx: () => new Response("<html>ok</html>", { status: 200 }),
      giottus: () => new Response(JSON.stringify({ code: -1003, message: "TOO_MANY_REQUESTS" }), { status: 429 }),
      zebpay: () => { throw new TypeError("fetch failed"); },
    }));
    expect(rates.wazirx).toMatchObject({ status: "unavailable", problem: "blocked", detail: "WazirX refuses requests from Railor’s server (HTTP 403)." });
    expect(rates.coindcx).toMatchObject({ status: "unavailable", problem: "unreadable" });
    expect(rates.giottus).toMatchObject({ status: "unavailable", problem: "rate_limited" });
    expect(rates.zebpay).toMatchObject({ status: "unavailable", problem: "unreachable", detail: "ZebPay didn't answer in time." });
    expect(rates.flitpay).toMatchObject({ status: "ok", bid: 102.33 });
  });

  it("treats HTTP 418 (an IP ban) as rate limiting, 401 as a refusal, a server error or timeout as unreachable, and a broken body as unreadable", async () => {
    const { rates } = await run(exchangeFetch({
      wazirx: () => new Response("", { status: 418 }),
      coindcx: () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); },
      giottus: () => new Response("{not json", { status: 200 }),
      zebpay: () => new Response("x".repeat(2_000_001), { status: 200 }),
      flitpay: () => new Response("", { status: 502 }),
    }));
    expect(rates.wazirx).toMatchObject({ problem: "rate_limited" });
    expect(rates.coindcx).toMatchObject({ problem: "unreachable" });
    expect(rates.giottus).toMatchObject({ problem: "unreadable" });
    expect(rates.zebpay).toMatchObject({ problem: "unreadable", detail: expect.stringContaining("too large") });
    expect(rates.flitpay).toMatchObject({ problem: "unreachable", detail: "Flitpay answered HTTP 502." });
    expect((await run(exchangeFetch({ wazirx: () => new Response("", { status: 401 }) }))).rates.wazirx).toMatchObject({ problem: "blocked" });
  });

  it("resolves even when every exchange is down and Wise is too", async () => {
    const down = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const result = await inrExchangeRates("USDT", { fetcher: down, now: new Date(NOW) });
    expect(result.reference).toBeNull();
    expect(Object.values(result.rates).every((rate) => rate?.status === "unavailable")).toBe(true);
  });
});

describe("USDC", () => {
  it("is read only from the exchanges that list USDC/INR, from their USDC markets", async () => {
    const fetcher = exchangeFetch();
    const { pair, rates } = await run(fetcher, {}, "USDC");
    expect(pair).toBe("USDC/INR");
    expect(Object.keys(rates)).toEqual(["wazirx", "coindcx"]);
    expect(fetcher.calls.map((call) => call.url)).toEqual([
      "https://api.wazirx.com/sapi/v1/depth?symbol=usdcinr&limit=100",
      "https://api.coindcx.com/market_data/orderbook?pair=I-USDC_INR",
    ]);
  });
});

describe("what is sent", () => {
  it("calls each exchange's documented public URL with a plain GET, an honest bot agent and no credentials", async () => {
    const fetcher = exchangeFetch();
    await run(fetcher);
    expect(fetcher.calls.map((call) => call.url)).toEqual([
      "https://api.wazirx.com/sapi/v1/depth?symbol=usdtinr&limit=100",
      "https://api.coindcx.com/market_data/orderbook?pair=I-USDT_INR",
      "https://api.giottus.com/api/v1/public/market/orderbook?symbol=USDT/INR&limit=50",
      "https://sapi.zebpay.com/api/v2/market/orderbook?symbol=USDT-INR&limit=100",
      "https://api.flitpay.com/v1/tickers/24hr/?symbol=INR_USDT",
    ]);
    for (const { init } of fetcher.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBeDefined();
      const headers = new Headers(init?.headers);
      expect(headers.get("user-agent")).toBe(PUBLIC_FEED_USER_AGENT);
      expect(headers.get("user-agent")).toMatch(/^RailorBot\/\d/);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("cookie")).toBeNull();
    }
  });
});

describe("shared cache", () => {
  const stub = (overrides: Partial<Record<ExchangeFeedSlug, Answer>> = {}) => {
    const fetcher = exchangeFetch(overrides);
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  };
  const live = (asset: ExchangeAsset = "USDT") => full(inrExchangeRates(asset, { reference: REFERENCE }));

  it("makes one call per exchange for every viewer in 15 seconds, including viewers who arrive together", async () => {
    const fetcher = stub();
    await Promise.all([live(), live(), live()]);
    expect(fetcher.calls).toHaveLength(5);
    vi.setSystemTime(NOW + 14_000);
    await live();
    expect(fetcher.calls).toHaveLength(5);
    vi.setSystemTime(NOW + 16_000);
    await live();
    expect(fetcher.calls).toHaveLength(10);
  });

  it("keeps USDT and USDC readings apart", async () => {
    const fetcher = stub();
    await live("USDT");
    await live("USDC");
    expect(fetcher.calls).toHaveLength(7);
  });

  it("keeps ageing a cached bid, so a feed that stops updating is dropped instead of served as fresh", async () => {
    stub({ wazirx: wazirx({ timestamp: NOW - 5_000 }) });
    expect((await live()).rates.wazirx.status).toBe("ok");
    vi.setSystemTime(NOW + 14_000);
    expect((await live()).rates.wazirx.status).toBe("ok");
    // The next real read finds the same old timestamp, 2+ minutes behind.
    vi.setSystemTime(NOW + 130_000);
    expect((await live()).rates.wazirx).toMatchObject({ status: "unavailable", problem: "stale" });
  });

  it("remembers a failed exchange for 30 seconds and one that asked Railor to slow down for two minutes", async () => {
    const fetcher = stub({ wazirx: () => new Response("", { status: 500 }), giottus: () => new Response("", { status: 429 }) });
    await live();
    expect(fetcher.calls).toHaveLength(5);
    vi.setSystemTime(NOW + 20_000);
    await live();
    // Three healthy exchanges re-read after 15s; the two failures are not retried yet.
    expect(fetcher.calls.filter((call) => /wazirx|giottus/.test(call.url))).toHaveLength(2);
    // After 30s WazirX is tried again; Giottus is still backing off after its 429.
    vi.setSystemTime(NOW + 31_000);
    await live();
    expect(fetcher.calls.filter((call) => call.url.includes("wazirx"))).toHaveLength(2);
    expect(fetcher.calls.filter((call) => call.url.includes("giottus"))).toHaveLength(1);
    vi.setSystemTime(NOW + 121_000);
    await live();
    expect(fetcher.calls.filter((call) => call.url.includes("giottus"))).toHaveLength(2);
  });

  it("asks an exchange that refuses Railor's server again only every five minutes", async () => {
    const fetcher = stub({ zebpay: () => new Response("<html>Attention Required</html>", { status: 403 }) });
    expect((await live()).rates.zebpay).toMatchObject({ status: "unavailable", problem: "blocked" });
    vi.setSystemTime(NOW + 200_000);
    expect((await live()).rates.zebpay).toMatchObject({ problem: "blocked" });
    expect(fetcher.calls.filter((call) => call.url.includes("zebpay"))).toHaveLength(1);
    vi.setSystemTime(NOW + 301_000);
    await live();
    expect(fetcher.calls.filter((call) => call.url.includes("zebpay"))).toHaveLength(2);
  });
});
