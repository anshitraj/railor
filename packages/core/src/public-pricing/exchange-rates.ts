import { midMarketRate } from "../pricing.js";
import { shared } from "./shared-cache.js";

/**
 * Live USDT/INR bids from Indian exchanges, read from each exchange's own
 * public market-data endpoint (no API key), confirmed with real calls on
 * 2026-11-18. The bid is the best price a buyer is offering right now, so it
 * is what a sale of the first USDT would fetch. It is a market reference, not a
 * quote: the fill price moves with the order book and the amount sold.
 *
 *   WazirX   GET api.wazirx.com/sapi/v1/ticker/24hr?symbol=usdtinr        (docs.wazirx.com)
 *   CoinDCX  GET api.coindcx.com/market_data/orderbook?pair=I-USDT_INR    (docs.coindcx.com)
 *   Giottus  GET api.giottus.com/api/v1/public/market/orderbook           (api.giottus.com/docs)
 *   ZebPay   GET sapi.zebpay.com/api/v2/market/allTickers, row USDT-INR   (github.com/zebpay/zebpay-api-references)
 *   Flitpay  GET api.flitpay.com/v1/tickers/24hr/?symbol=INR_USDT         (api.flitpay.com/public-api-of-flitpay)
 *
 * SunCrypto's /public/tickers answers, but lists a bid above its ask on every
 * pair, so which side is which cannot be told; Mudrex's public price API covers
 * its futures only. Neither is read: those cards stay facts-only.
 *
 * ZebPay documents its endpoint as public, and it answered a plain curl, but its
 * Cloudflare returned 403 to Node's fetch on 2026-11-18, so from this server it
 * shows as "blocked" until ZebPay lets Railor read it. No other transport or
 * header is used to get past that: the request is always an honest GET.
 *
 * Nothing here throws into a page. A feed that is down, slow, rate limited,
 * unreadable or implausible becomes an "unavailable" entry with the reason.
 */

export type ExchangeFeedSlug = "wazirx" | "coindcx" | "giottus" | "zebpay" | "flitpay";

export type ExchangeRateProblem =
  | "unreachable"
  | "blocked"
  | "rate_limited"
  | "unreadable"
  | "invalid_price"
  | "crossed"
  | "stale"
  | "out_of_range";

export interface ExchangeBid {
  status: "ok";
  slug: ExchangeFeedSlug;
  /** INR for one USDT: the best bid on the exchange. */
  bid: number;
  /** The best ask when the feed gives one; a bid above it is rejected as crossed. */
  ask: number | null;
  /** When the bid was observed: the exchange's own timestamp, or Railor's read time when the feed sends none. */
  observedAt: string;
  clock: "exchange" | "railor";
  /** Percent above (+) or below (−) Wise's mid-market USD/INR rate; null when that rate didn't load. */
  gapPct: number | null;
  source: { label: string; url: string };
}

export interface ExchangeBidUnavailable {
  status: "unavailable";
  slug: ExchangeFeedSlug;
  problem: ExchangeRateProblem;
  detail: string;
}

export type ExchangeRate = ExchangeBid | ExchangeBidUnavailable;

export interface UsdtInrExchangeRates {
  pair: "USDT/INR";
  /** Wise's public mid-market USD/INR rate, the reference every gap is measured against. */
  reference: { rate: number; source: string; observedAt: string } | null;
  rates: Record<ExchangeFeedSlug, ExchangeRate>;
  generatedAt: string;
}

/** Who is calling, said plainly (same agent as the page fetcher in net-guard.ts). Flitpay's Cloudflare turned a bare curl agent away with a 403 and accepts this one. */
export const PUBLIC_FEED_USER_AGENT = "RailorBot/1.0 (+https://railor.dev)";

const FEED_TIMEOUT_MS = 4_000;
/** WazirX and Giottus allow about one call a second per IP; a shared reading lives this long. */
const FRESH_MS = 15_000;
const RETRY_AFTER_FAILURE_MS = 30_000;
const BACKOFF_AFTER_429_MS = 120_000;
/** An exchange that refuses Railor's server is asked again only occasionally. */
const RETRY_AFTER_BLOCK_MS = 300_000;
const MAX_BODY_CHARS = 2_000_000;
/** An exchange timestamp older than this is a frozen feed. */
export const MAX_BID_AGE_MS = 120_000;
/** Clock skew allowed before an exchange timestamp counts as invalid. */
const MAX_FUTURE_MS = 60_000;
/** Rejected as a unit slip when this far from Wise's mid-market USD/INR. USDT has sat near 10% above it; this only catches nonsense. */
export const MAX_GAP_FROM_REFERENCE = 0.3;
/** INR per USDT, for the moment there is no reference to compare with. */
const PLAUSIBLE_INR = { min: 20, max: 500 };

interface Reading {
  bid: number;
  ask: number;
  /** The exchange's own time in milliseconds, when its response has one. */
  at: number | null;
}

class FeedError extends Error {
  constructor(readonly problem: ExchangeRateProblem, message: string) {
    super(message);
  }
}

interface Feed {
  slug: ExchangeFeedSlug;
  name: string;
  label: string;
  url: string;
  docs: string;
  read(body: unknown): Reading;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** A number from a JSON number or numeric string; an empty string is no number, not zero. */
function num(value: unknown): number {
  if (typeof value === "number") return value;
  return typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
}

/** Exchanges mix epoch seconds and milliseconds, and some send the opposite of what their docs say (WazirX, CoinDCX). */
function toMillis(value: unknown): number | null {
  const n = num(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n < 1e11 ? n * 1000 : n);
}

/** Best price among levels that have a price and a size above zero; NaN when there is none. */
function best(levels: Array<[unknown, unknown]>, side: "bid" | "ask"): number {
  let out = Number.NaN;
  for (const [price, size] of levels) {
    const p = num(price);
    if (!(p > 0) || !(num(size) > 0)) continue;
    if (Number.isNaN(out) || (side === "bid" ? p > out : p < out)) out = p;
  }
  return out;
}

const unreadable = (feed: string, what: string) => new FeedError("unreadable", `${feed} sent ${what} Railor couldn't read.`);

const FEEDS: Feed[] = [
  {
    slug: "wazirx", name: "WazirX", label: "WazirX public ticker",
    url: "https://api.wazirx.com/sapi/v1/ticker/24hr?symbol=usdtinr",
    docs: "https://docs.wazirx.com/",
    read(body) {
      const row = record(body);
      if (!row || row.symbol !== "usdtinr") throw unreadable("WazirX", "a ticker");
      return { bid: num(row.bidPrice), ask: num(row.askPrice), at: toMillis(row.at) };
    },
  },
  {
    slug: "coindcx", name: "CoinDCX", label: "CoinDCX public order book",
    url: "https://api.coindcx.com/market_data/orderbook?pair=I-USDT_INR&depth=5",
    docs: "https://docs.coindcx.com/",
    read(body) {
      const book = record(body);
      const bids = record(book?.bids);
      const asks = record(book?.asks);
      if (!book || !bids || !asks) throw unreadable("CoinDCX", "an order book");
      return { bid: best(Object.entries(bids), "bid"), ask: best(Object.entries(asks), "ask"), at: toMillis(book.timestamp) };
    },
  },
  {
    slug: "giottus", name: "Giottus", label: "Giottus public order book",
    url: "https://api.giottus.com/api/v1/public/market/orderbook?symbol=USDT/INR&limit=5",
    docs: "https://api.giottus.com/docs/",
    read(body) {
      const book = record(body);
      const levels = (side: unknown) => (Array.isArray(side) ? side.map((level): [unknown, unknown] => (Array.isArray(level) ? [level[0], level[1]] : [null, null])) : null);
      const bids = levels(book?.bids);
      const asks = levels(book?.asks);
      if (!bids || !asks) throw unreadable("Giottus", "an order book");
      // The book carries no timestamp: the read time is shown instead.
      return { bid: best(bids, "bid"), ask: best(asks, "ask"), at: null };
    },
  },
  {
    slug: "zebpay", name: "ZebPay", label: "ZebPay public tickers",
    url: "https://sapi.zebpay.com/api/v2/market/allTickers",
    docs: "https://github.com/zebpay/zebpay-api-references/blob/main/spot/api-reference/public-endpoints.md",
    read(body) {
      const rows = record(body)?.data;
      if (!Array.isArray(rows)) throw unreadable("ZebPay", "a ticker list");
      const row = rows.map(record).find((candidate) => candidate?.symbol === "USDT-INR");
      if (!row) throw unreadable("ZebPay", "a ticker list without USDT-INR, which");
      // A bid with no size behind it is not a bid.
      const size = num(row.bidVolume);
      return { bid: Number.isFinite(size) && size <= 0 ? Number.NaN : num(row.bid), ask: num(row.ask), at: toMillis(row.timestamp) };
    },
  },
  {
    slug: "flitpay", name: "Flitpay", label: "Flitpay public ticker",
    url: "https://api.flitpay.com/v1/tickers/24hr/?symbol=INR_USDT",
    docs: "https://api.flitpay.com/public-api-of-flitpay/",
    read(body) {
      const row = Array.isArray(body) ? record(body.find((candidate) => record(candidate)?.symbol === "INR_USDT")) : null;
      if (!row) throw unreadable("Flitpay", "a ticker");
      // Flitpay's documented key for the bid has a space in it.
      return { bid: num(row["bid price"]), ask: num(row.ask_price), at: toMillis(row.at) };
    },
  },
];

/** The feeds Railor reads, for pages that cite them. */
export const EXCHANGE_FEEDS: ReadonlyArray<{ slug: ExchangeFeedSlug; name: string; label: string; endpoint: string; docs: string }> =
  FEEDS.map(({ slug, name, label, url, docs }) => ({ slug, name, label, endpoint: url, docs }));

type Outcome = { ok: true; reading: Reading; readAt: number } | { ok: false; problem: ExchangeRateProblem; detail: string };

/** Never rejects: every way a feed can fail is an outcome, so a bad feed can't take a page down. */
async function fetchOutcome(feed: Feed, fetcher: typeof fetch): Promise<Outcome> {
  try {
    const response = await fetcher(feed.url, {
      headers: { accept: "application/json", "user-agent": PUBLIC_FEED_USER_AGENT },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status === 429 || response.status === 418) {
      return { ok: false, problem: "rate_limited", detail: `${feed.name} asked Railor to slow down (HTTP ${response.status}).` };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, problem: "blocked", detail: `${feed.name} refuses requests from Railor’s server (HTTP ${response.status}).` };
    }
    if (!response.ok) return { ok: false, problem: "unreachable", detail: `${feed.name} answered HTTP ${response.status}.` };
    const text = await response.text();
    if (text.length > MAX_BODY_CHARS) throw new FeedError("unreadable", `${feed.name} sent a response too large to read.`);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw unreadable(feed.name, "something other than JSON that");
    }
    let reading: Reading;
    try {
      reading = feed.read(body);
    } catch (error) {
      throw error instanceof FeedError ? error : unreadable(feed.name, "a price list");
    }
    return { ok: true, reading, readAt: Date.now() };
  } catch (error) {
    if (error instanceof FeedError) return { ok: false, problem: error.problem, detail: error.message };
    return { ok: false, problem: "unreachable", detail: `${feed.name} didn't answer in time.` };
  }
}

const outcomeTtl = (outcome: Outcome) =>
  outcome.ok ? FRESH_MS : outcome.problem === "rate_limited" ? BACKOFF_AFTER_429_MS : outcome.problem === "blocked" ? RETRY_AFTER_BLOCK_MS : RETRY_AFTER_FAILURE_MS;

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Strict checks on a reading, made each time it is served (a cached reading
 * keeps ageing): a usable bid above zero, not above its own ask, not stale, and
 * not absurd against the mid-market rate.
 */
function judge(feed: Feed, outcome: Outcome, now: number, reference: number | null): ExchangeRate {
  const fail = (problem: ExchangeRateProblem, detail: string): ExchangeBidUnavailable => ({ status: "unavailable", slug: feed.slug, problem, detail });
  if (!outcome.ok) return fail(outcome.problem, outcome.detail);
  const { bid, at } = outcome.reading;
  const ask = Number.isFinite(outcome.reading.ask) && outcome.reading.ask > 0 ? outcome.reading.ask : null;
  if (!Number.isFinite(bid) || !(bid > 0)) return fail("invalid_price", `${feed.name} has no bid right now.`);
  if (ask !== null && bid > ask) return fail("crossed", `${feed.name} lists a bid above its ask, so its bid can't be trusted.`);
  if (bid < PLAUSIBLE_INR.min || bid > PLAUSIBLE_INR.max || (reference !== null && Math.abs(bid / reference - 1) > MAX_GAP_FROM_REFERENCE)) {
    return fail("out_of_range", `${feed.name}'s bid is too far from the mid-market rate to be a real USDT/INR price.`);
  }
  let observed = outcome.readAt;
  let clock: ExchangeBid["clock"] = "railor";
  if (at !== null) {
    if (at - now > MAX_FUTURE_MS) return fail("stale", `${feed.name}'s timestamp is ahead of the clock, so its price can't be dated.`);
    observed = Math.min(at, now);
    clock = "exchange";
  }
  if (now - observed > MAX_BID_AGE_MS) return fail("stale", `${feed.name}'s price is more than ${MAX_BID_AGE_MS / 60_000} minutes old.`);
  return {
    status: "ok",
    slug: feed.slug,
    bid,
    ask,
    observedAt: new Date(observed).toISOString(),
    clock,
    gapPct: reference !== null ? round((bid / reference - 1) * 100, 2) : null,
    source: { label: feed.label, url: feed.docs },
  };
}

export interface ExchangeRateDeps {
  /** Injected fetch (tests); it bypasses the shared cache. */
  fetcher?: typeof fetch;
  now?: Date;
  /** Mid-market USD/INR to measure against. Omitted: Wise's public rate. */
  reference?: { rate: number; observedAt?: string } | null;
}

/**
 * Live USDT/INR bids from every exchange with a usable public feed, each
 * checked, with the gap to Wise's mid-market rate. One read per exchange is
 * shared for 15s across every caller; a failed one is remembered for 30s
 * (two minutes after an HTTP 429, five after a 403), so a down or refusing feed
 * isn't hammered.
 */
export async function usdtInrExchangeRates(deps: ExchangeRateDeps = {}): Promise<UsdtInrExchangeRates> {
  const fetcher = deps.fetcher ?? fetch;
  const [mid, outcomes] = await Promise.all([
    deps.reference !== undefined
      ? Promise.resolve(deps.reference && Number.isFinite(deps.reference.rate) && deps.reference.rate > 0 ? { rate: deps.reference.rate, observedAt: deps.reference.observedAt ?? (deps.now ?? new Date()).toISOString() } : null)
      : midMarketRate("USD", "INR", deps.fetcher),
    Promise.all(FEEDS.map((feed) => (deps.fetcher ? fetchOutcome(feed, fetcher) : shared(`exchange-feed:${feed.slug}`, outcomeTtl, () => fetchOutcome(feed, fetcher))))),
  ]);
  const now = deps.now?.getTime() ?? Date.now();
  const reference = mid ? { rate: mid.rate, source: "Wise's public rate (mid-market)", observedAt: mid.observedAt } : null;
  const rates = Object.fromEntries(FEEDS.map((feed, index) => [feed.slug, judge(feed, outcomes[index]!, now, reference?.rate ?? null)])) as Record<ExchangeFeedSlug, ExchangeRate>;
  return { pair: "USDT/INR", reference, rates, generatedAt: new Date(now).toISOString() };
}
