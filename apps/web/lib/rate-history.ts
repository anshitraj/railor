export const HISTORY_RANGES = { bank: [7, 30, 90, 365], stablecoin: [7, 30, 90] } as const;
export type HistoryDays = (typeof HISTORY_RANGES.bank)[number];
export type HistoryRequest = { mode: "bank" | "stablecoin"; from: string; to: string; provider?: string; network?: string; days?: HistoryDays };
export type HistoryPoint = { date: string; rate: number | null };
export type RateHistory = { from: string; to: string; start: string; end: string; source: string; sourceUrl: string; note: string; points: HistoryPoint[] };

const DAY = 86_400_000;
const COINS: Record<string, string> = { USDT: "tether", USDC: "usd-coin", EURC: "euro-coin" };
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Daily market observations on the requested UTC dates, with gaps preserved. */
export async function loadRateHistory(request: HistoryRequest, fetcher: typeof fetch = fetch, now = new Date()): Promise<RateHistory> {
  const days = request.days ?? 7;
  const end = dateOf(now.getTime());
  const startMs = Date.parse(end) - (days - 1) * DAY;
  const start = dateOf(startMs);
  const slots = Array.from({ length: days }, (_, index) => dateOf(startMs + index * DAY));
  const dates = new Set(slots);
  const finish = (rates: Map<string, number>, source: string, sourceUrl: string, note: string): RateHistory => ({
    from: request.from, to: request.to, start, end, source, sourceUrl, note,
    points: slots.map((date) => ({ date, rate: rates.get(date) ?? null })),
  });
  const json = async (url: string): Promise<unknown> => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Historical rates are temporarily unavailable.");
    return response.json();
  };
  const daily = (observations: Array<[number, number]>) => {
    const values = new Map<string, number>();
    for (const [stamp, price] of observations.sort((a, b) => a[0] - b[0])) {
      if (!Number.isFinite(stamp) || stamp < startMs || stamp > now.getTime() || !positive(price)) continue;
      values.set(dateOf(stamp), price);
    }
    return values;
  };

  if (request.mode === "bank") {
    const params = new URLSearchParams({ from: start, to: end, base: request.from, quotes: request.to });
    const rows = await json(`https://api.frankfurter.dev/v2/rates?${params}`);
    const values = new Map<string, number>();
    if (Array.isArray(rows)) for (const row of rows) {
      if (row && dates.has(row.date) && row.base === request.from && row.quote === request.to && positive(row.rate)) values.set(row.date, row.rate);
    }
    return finish(values, "Frankfurter daily reference rates", "https://frankfurter.dev/", "Reference rates, excluding provider fees. Dates without a published observation remain empty.");
  }

  let exchangeUnavailable = false;
  if (request.to === "INR" && (request.provider === "coindcx" || request.provider === "wazirx")) {
    const coindcx = request.provider === "coindcx";
    try {
      const url = coindcx
        ? `https://api.coindcx.com/market_data/candles?${new URLSearchParams({ pair: `I-${request.from}_INR`, interval: "1d", limit: String(days), startTime: String(startMs), endTime: String(now.getTime()) })}`
        : `https://api.wazirx.com/sapi/v1/klines?${new URLSearchParams({ symbol: `${request.from.toLowerCase()}inr`, interval: "1d", limit: String(days), startTime: String(startMs / 1000), endTime: String(Math.floor(now.getTime() / 1000)) })}`;
      const rows = await json(url);
      const prices: Array<[number, number]> = Array.isArray(rows) ? rows.flatMap((row) => {
        const time = coindcx ? row?.time : Array.isArray(row) ? row[0] * 1000 : NaN;
        const rate = coindcx ? row?.close : Array.isArray(row) ? row[4] : null;
        return typeof time === "number" && positive(rate) ? [[time, rate] as [number, number]] : [];
      }) : [];
      const values = daily(prices);
      if (values.size) return finish(values, `${coindcx ? "CoinDCX" : "WazirX"} daily candles`, coindcx ? "https://docs.coindcx.com/#candles" : "https://docs.wazirx.com/#kline-candlestick-data", "Daily market close before fees and tax; today’s candle may change. Market prices do not include network or deposit availability.");
    } catch { /* Keep a useful market reference when the selected exchange has no history. */ }
    exchangeUnavailable = true;
  }

  if (!COINS[request.from] || (request.to !== "INR" && request.to !== "EURC")) throw new Error("Historical rates are not available for this pair.");
  const market = async (coin: string, currency: string) => {
    const body = await json(`https://api.coingecko.com/api/v3/coins/${COINS[coin]}/market_chart?${new URLSearchParams({ vs_currency: currency, days: String(days) })}`);
    const rows = body && typeof body === "object" && "prices" in body ? body.prices : [];
    return Array.isArray(rows) ? rows.filter((row): row is [number, number] => Array.isArray(row) && typeof row[0] === "number" && positive(row[1])) : [];
  };
  const [fromPrices, toPrices] = await Promise.all([market(request.from, request.to === "EURC" ? "eur" : "inr"), request.to === "EURC" ? market("EURC", "eur") : Promise.resolve(null)]);
  // Match hourly observation buckets; never divide prices observed on different days/hours.
  const eurc = new Map(toPrices?.map(([time, rate]) => [Math.floor(time / 3_600_000), rate]));
  const prices: Array<[number, number]> = fromPrices.flatMap(([time, rate]) => {
    if (!toPrices) return [[time, rate]];
    const denominator = eurc.get(Math.floor(time / 3_600_000));
    return denominator ? [[time, rate / denominator]] : [];
  });
  return finish(daily(prices), "CoinGecko market reference", "https://www.coingecko.com/", `${exchangeUnavailable ? "Exchange history unavailable. " : ""}Last observed market rate each day, before fees and tax. Network-independent reference, not a provider or DEX quote; today may change.`);
}
