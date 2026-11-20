import { midMarketRate } from "../pricing.js";
import { shared } from "./shared-cache.js";

/**
 * Live USDT/INR and USDC/INR prices from Indian exchanges, read from each
 * exchange's own public market-data endpoint (no API key), confirmed with real
 * calls on 2026-11-18. The bid is the best price a buyer is offering right now.
 * Where the endpoint gives the order book the levels come back too, so a quote
 * can walk them for the amount sold ("book"); where it gives only the best
 * bid and ask ("top") the whole amount can only be priced at that bid. Either
 * way it is a market reference, not a quote.
 *
 *   WazirX   GET api.wazirx.com/sapi/v1/depth?symbol=usdtinr&limit=100    (docs.wazirx.com)         book, USDT + USDC
 *   CoinDCX  GET api.coindcx.com/market_data/orderbook?pair=I-USDT_INR    (docs.coindcx.com)        book, USDT + USDC
 *   Giottus  GET api.giottus.com/api/v1/public/market/orderbook           (api.giottus.com/docs)    book, USDT
 *   ZebPay   GET sapi.zebpay.com/api/v2/market/orderbook?symbol=USDT-INR (github.com/zebpay/zebpay-api-references) book, USDT
 *   Flitpay  GET api.flitpay.com/v1/tickers/24hr/?symbol=INR_USDT         (api.flitpay.com/public-api-of-flitpay) top, USDT
 *   KoinBX   GET api.koinbx.com/orderbook?market_pair=USDT_INR&depth=50   (koinbx.com/publicapi)    book, USDT + USDC
 *   CoinSwitch PRO uses a separate public order book for its web market.
 *
 * SunCrypto publishes timestamped trades. These are shown as trades because
 * its ticker lists a crossed spread and cannot establish a current sell bid.
 *
 * ZebPay documents its endpoint as public, and it answered a plain curl, but its
 * Cloudflare returned 403 to Node's fetch on 2026-11-18, so from this server it
 * shows as "blocked" until ZebPay lets Railor read it. No other transport or
 * header is used to get past that: the request is always an honest GET.
 *
 * Nothing here throws into a page. A feed that is down, slow, rate limited,
 * unreadable or implausible becomes an "unavailable" entry with the reason.
 */

export type ExchangeFeedSlug = "wazirx" | "coindcx" | "giottus" | "zebpay" | "flitpay" | "koinbx" | "suncrypto" | "coinswitch";
export type ExchangeAsset = "USDT" | "USDC";
/** [price in INR, size in tokens] */
export type BookLevel = [price: number, size: number];

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
  /** INR for one token: the best bid on the exchange. */
  bid: number;
  /** The best ask when the feed gives one; a bid above it is rejected as crossed. */
  ask: number | null;
  /** When the bid was observed: the exchange's own timestamp, or Railor's read time when the feed sends none. */
  observedAt: string;
  clock: "exchange" | "railor";
  /** "book": `bids` holds the order book to walk. "top": the feed gives only the best bid and ask, so `bids` is empty. */
  depth: "book" | "top";
  /** Bids with a size, best first, for feeds that give the book. */
  bids: BookLevel[];
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

export interface ExchangeTradeReference {
  status: "last_trade";
  slug: ExchangeFeedSlug;
  price: number;
  size: number;
  observedAt: string;
  source: ExchangeBid["source"];
}

export type ExchangeRate = ExchangeBid | ExchangeBidUnavailable | ExchangeTradeReference;

export interface InrExchangeRates {
  pair: `${ExchangeAsset}/INR`;
  /** Wise's public mid-market USD/INR rate, the reference every gap is measured against. */
  reference: { rate: number; source: string; observedAt: string } | null;
  /** One entry per exchange that lists this token. */
  rates: Partial<Record<ExchangeFeedSlug, ExchangeRate>>;
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
const MAX_TRADE_AGE_MS = 30 * 60_000;
/** Clock skew allowed before an exchange timestamp counts as invalid. */
const MAX_FUTURE_MS = 60_000;
/** Rejected as a unit slip when this far from Wise's mid-market USD/INR. USDT has sat near 10% above it; this only catches nonsense. */
export const MAX_GAP_FROM_REFERENCE = 0.3;
/** INR per USDT, for the moment there is no reference to compare with. */
const PLAUSIBLE_INR = { min: 20, max: 500 };

interface BidReading {
  bid: number;
  ask: number;
  /** The bids of a book, or null when the feed gives only a best bid and ask. */
  levels: BookLevel[] | null;
  /** The exchange's own time in milliseconds, when its response has one. */
  at: number | null;
}

interface TradeReading {
  price: number;
  size: number;
  at: number;
}

type Reading = BidReading | TradeReading;

class FeedError extends Error {
  constructor(readonly problem: ExchangeRateProblem, message: string) {
    super(message);
  }
}

interface Feed {
  slug: ExchangeFeedSlug;
  name: string;
  label: string;
  assets: ExchangeAsset[];
  url(asset: ExchangeAsset): string;
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

/** Levels from `[price, size]` pairs, best bid first, ignoring any without a price and a size. */
function levelsOf(pairs: Array<[unknown, unknown]>, side: "bid" | "ask"): BookLevel[] {
  const out: BookLevel[] = [];
  for (const [price, size] of pairs) {
    const p = num(price);
    const q = num(size);
    if (p > 0 && q > 0) out.push([p, q]);
  }
  return out.sort((x, y) => (side === "bid" ? y[0] - x[0] : x[0] - y[0]));
}

const pairsOf = (side: unknown): Array<[unknown, unknown]> | null =>
  Array.isArray(side) ? side.map((level): [unknown, unknown] => (Array.isArray(level) ? [level[0], level[1]] : [null, null])) : null;

/** A book reading: the best bid and ask come from the levels, the bids are kept to walk. */
function bookReading(bids: Array<[unknown, unknown]>, asks: Array<[unknown, unknown]>, at: number | null): BidReading {
  const bidLevels = levelsOf(bids, "bid");
  const askLevels = levelsOf(asks, "ask");
  return { bid: bidLevels[0]?.[0] ?? Number.NaN, ask: askLevels[0]?.[0] ?? Number.NaN, levels: bidLevels, at };
}

const BOTH: ExchangeAsset[] = ["USDT", "USDC"];

const FEEDS: Feed[] = [
  {
    slug: "wazirx", name: "WazirX", label: "WazirX public order book", assets: BOTH,
    url: (asset) => `https://api.wazirx.com/sapi/v1/depth?symbol=${asset.toLowerCase()}inr&limit=100`,
    docs: "https://docs.wazirx.com/",
    read(body) {
      const book = record(body);
      const bids = pairsOf(book?.bids);
      const asks = pairsOf(book?.asks);
      if (!book || !bids || !asks) throw unreadable("WazirX", "an order book");
      return bookReading(bids, asks, toMillis(book.timestamp));
    },
  },
  {
    slug: "coindcx", name: "CoinDCX", label: "CoinDCX public order book", assets: BOTH,
    url: (asset) => `https://api.coindcx.com/market_data/orderbook?pair=I-${asset}_INR`,
    docs: "https://docs.coindcx.com/",
    read(body) {
      const book = record(body);
      const bids = record(book?.bids);
      const asks = record(book?.asks);
      if (!book || !bids || !asks) throw unreadable("CoinDCX", "an order book");
      return bookReading(Object.entries(bids), Object.entries(asks), toMillis(book.timestamp));
    },
  },
  {
    slug: "giottus", name: "Giottus", label: "Giottus public order book", assets: ["USDT"],
    url: () => "https://api.giottus.com/api/v1/public/market/orderbook?symbol=USDT/INR&limit=50",
    docs: "https://api.giottus.com/docs/",
    read(body) {
      const book = record(body);
      const bids = pairsOf(book?.bids);
      const asks = pairsOf(book?.asks);
      if (!bids || !asks) throw unreadable("Giottus", "an order book");
      // The book carries no timestamp: the read time is shown instead.
      return bookReading(bids, asks, null);
    },
  },
  {
    slug: "zebpay", name: "ZebPay", label: "ZebPay public order book", assets: ["USDT"],
    url: () => "https://sapi.zebpay.com/api/v2/market/orderbook?symbol=USDT-INR&limit=100",
    docs: "https://github.com/zebpay/zebpay-api-references/blob/main/spot/api-reference/public-endpoints.md",
    read(body) {
      const book = record(record(body)?.data);
      const bids = pairsOf(book?.bids);
      const asks = pairsOf(book?.asks);
      if (!book || !bids || !asks) throw unreadable("ZebPay", "an order book");
      return bookReading(bids, asks, toMillis(book.timestamp));
    },
  },
  {
    slug: "flitpay", name: "Flitpay", label: "Flitpay public ticker", assets: ["USDT"],
    url: () => "https://api.flitpay.com/v1/tickers/24hr/?symbol=INR_USDT",
    docs: "https://api.flitpay.com/public-api-of-flitpay/",
    read(body) {
      const row = Array.isArray(body) ? record(body.find((candidate) => record(candidate)?.symbol === "INR_USDT")) : null;
      if (!row) throw unreadable("Flitpay", "a ticker");
      // Flitpay's documented key for the bid has a space in it. It gives no sizes, so the amount can't be walked.
      return { bid: num(row["bid price"]), ask: num(row.ask_price), levels: null, at: toMillis(row.at) };
    },
  },
  {
    slug: "koinbx", name: "KoinBX", label: "KoinBX public order book", assets: BOTH,
    url: (asset) => `https://api.koinbx.com/orderbook?market_pair=${asset}_INR&depth=50`,
    docs: "https://koinbx.com/publicapi",
    read(body) {
      const envelope = record(body);
      const book = record(envelope?.data);
      const bids = pairsOf(book?.bids);
      const asks = pairsOf(book?.asks);
      const at = toMillis(book?.timestamp);
      if (envelope?.status !== "1" || !bids || !asks || at === null) throw unreadable("KoinBX", "an order book");
      return bookReading(bids, asks, at);
    },
  },
  {
    slug: "suncrypto", name: "SunCrypto", label: "SunCrypto recent trades", assets: ["USDT"],
    url: () => "https://suncrypto.in/public/historical_trades?ticker_id=USDT_INR",
    docs: "https://docs.suncrypto.in/",
    read(body) {
      if (!Array.isArray(body)) throw unreadable("SunCrypto", "a trade list");
      let latest: TradeReading | undefined;
      for (const entry of body) {
        const trade = record(entry);
        const at = toMillis(trade?.time);
        const price = num(trade?.price);
        const size = num(trade?.qty);
        if (at !== null && Number.isFinite(price) && price > 0 && Number.isFinite(size) && size > 0 && (!latest || at > latest.at)) {
          latest = { price, size, at };
        }
      }
      if (!latest) throw new FeedError("invalid_price", "SunCrypto has no usable USDT/INR trades.");
      return latest;
    },
  },
  {
    slug: "coinswitch", name: "CoinSwitch PRO", label: "CoinSwitch PRO public order book", assets: ["USDT"],
    url: () => "https://coinswitch.co/pro/api/v1/realtime-rates/depth?symbol=usdt,inr&exchange=csx",
    docs: "https://coinswitch.co/pro/usdt-inr/csx",
    read(body) {
      const envelope = record(body);
      const book = record(envelope?.data);
      const bids = pairsOf(book?.bids);
      const asks = pairsOf(book?.asks);
      const at = toMillis(book?.timestamp);
      if (envelope?.success !== true || book?.s !== "USDT,INR" || !bids || !asks || at === null) throw unreadable("CoinSwitch PRO", "a USDT/INR order book");
      return bookReading(bids, asks, at);
    },
  },
];

/** The feeds Railor reads, for pages that cite them. */
export const EXCHANGE_FEEDS: ReadonlyArray<{ slug: ExchangeFeedSlug; name: string; label: string; assets: ExchangeAsset[]; endpoint: string; docs: string }> =
  FEEDS.map(({ slug, name, label, assets, url, docs }) => ({ slug, name, label, assets, endpoint: url(assets[0]!), docs }));

type Outcome = { ok: true; reading: Reading; readAt: number } | { ok: false; problem: ExchangeRateProblem; detail: string };

/** Never rejects: every way a feed can fail is an outcome, so a bad feed can't take a page down. */
async function fetchOutcome(feed: Feed, asset: ExchangeAsset, fetcher: typeof fetch): Promise<Outcome> {
  try {
    const response = await fetcher(feed.url(asset), {
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
const plausible = (price: number, reference: number | null) =>
  price >= PLAUSIBLE_INR.min && price <= PLAUSIBLE_INR.max && (reference === null || Math.abs(price / reference - 1) <= MAX_GAP_FROM_REFERENCE);

/**
 * Strict checks on a reading, made each time it is served (a cached reading
 * keeps ageing): a usable bid above zero, not above its own ask, not stale, and
 * not absurd against the mid-market rate.
 */
function judge(feed: Feed, outcome: Outcome, now: number, reference: number | null): ExchangeRate {
  const fail = (problem: ExchangeRateProblem, detail: string): ExchangeBidUnavailable => ({ status: "unavailable", slug: feed.slug, problem, detail });
  if (!outcome.ok) return fail(outcome.problem, outcome.detail);
  const source = { label: feed.label, url: feed.docs };
  if ("price" in outcome.reading) {
    const { price, size, at } = outcome.reading;
    if (!plausible(price, reference)) return fail("out_of_range", `${feed.name} returned a trade price outside the expected INR range.`);
    if (at - now > MAX_FUTURE_MS || now - at > MAX_TRADE_AGE_MS) {
      return fail("stale", `${feed.name} has no usable trade timestamp in the past 30 minutes.`);
    }
    return { status: "last_trade", slug: feed.slug, price, size, observedAt: new Date(Math.min(at, now)).toISOString(), source };
  }
  const { bid, at, levels } = outcome.reading;
  const ask = Number.isFinite(outcome.reading.ask) && outcome.reading.ask > 0 ? outcome.reading.ask : null;
  if (!Number.isFinite(bid) || !(bid > 0)) return fail("invalid_price", `${feed.name} has no bid right now.`);
  if (ask !== null && bid > ask) return fail("crossed", `${feed.name} lists a bid above its ask, so its bid can't be trusted.`);
  if (!plausible(bid, reference)) {
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
    depth: levels ? "book" : "top",
    bids: levels ?? [],
    gapPct: reference !== null ? round((bid / reference - 1) * 100, 2) : null,
    source,
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
 * Live INR prices for one token from every exchange that lists it and has a
 * usable public feed, each checked, with the gap to Wise's mid-market rate.
 * One read per exchange and token is shared for 15s across every caller; a
 * failed one is remembered for 30s (two minutes after an HTTP 429, five after a
 * 403), so a down or refusing feed isn't hammered.
 */
export async function inrExchangeRates(asset: ExchangeAsset, deps: ExchangeRateDeps = {}): Promise<InrExchangeRates> {
  const fetcher = deps.fetcher ?? fetch;
  const feeds = FEEDS.filter((feed) => feed.assets.includes(asset));
  const [mid, outcomes] = await Promise.all([
    deps.reference !== undefined
      ? Promise.resolve(deps.reference && Number.isFinite(deps.reference.rate) && deps.reference.rate > 0 ? { rate: deps.reference.rate, observedAt: deps.reference.observedAt ?? (deps.now ?? new Date()).toISOString() } : null)
      : midMarketRate("USD", "INR", deps.fetcher),
    Promise.all(feeds.map((feed) => (deps.fetcher ? fetchOutcome(feed, asset, fetcher) : shared(`exchange-feed:${feed.slug}:${asset}`, outcomeTtl, () => fetchOutcome(feed, asset, fetcher))))),
  ]);
  const now = deps.now?.getTime() ?? Date.now();
  const reference = mid ? { rate: mid.rate, source: "Wise's public rate (mid-market)", observedAt: mid.observedAt } : null;
  const rates = Object.fromEntries(feeds.map((feed, index) => [feed.slug, judge(feed, outcomes[index]!, now, reference?.rate ?? null)])) as InrExchangeRates["rates"];
  return { pair: `${asset}/INR`, reference, rates, generatedAt: new Date(now).toISOString() };
}

const SETTLE_REFERENCE_URL = "https://settle.ledgerpe.com/api/quote/forex-rate";

export interface SettleInrReference {
  /** USD/INR input used by SETTLE's public USDT calculator. */
  rate: number;
  observedAt: string;
}

/** This is the calculator's rate input. The authenticated wallet quote is a separate product. */
export async function settleInrReference(fetcher: typeof fetch = fetch, now?: Date): Promise<SettleInrReference | null> {
  const load = async () => {
    try {
      const response = await fetcher(SETTLE_REFERENCE_URL, {
        headers: { accept: "application/json", "user-agent": PUBLIC_FEED_USER_AGENT },
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) return null;
      const body = record(await response.json());
      if (body?.success !== true || body.stale !== false || typeof body.timestamp !== "string") return null;
      const rate = num(body.usdToInr);
      const at = Date.parse(body.timestamp);
      return Number.isFinite(at) && plausible(rate, null) ? { rate, observedAt: new Date(at).toISOString() } : null;
    } catch {
      return null;
    }
  };
  const result = now ? await load() : await shared("settle-inr-reference", FRESH_MS, load);
  if (!result) return null;
  const age = (now?.getTime() ?? Date.now()) - Date.parse(result.observedAt);
  return age >= -MAX_FUTURE_MS && age <= MAX_BID_AGE_MS ? result : null;
}
