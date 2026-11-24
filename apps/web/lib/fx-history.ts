import type { ReceiptFx } from "@railor/core";

/**
 * Daily reference exchange rates for any date, from public sources that need
 * no key. These are market observations to explain how far the rate moved
 * between a quote and a credit; they are never prices anyone can trade at.
 *
 * Both dates are always read from the same source, so a gap between two
 * sources' rates never shows up as market movement.
 */
export interface FxObservation { rate: number; date: string }
interface FxSource {
  name: string;
  url: string;
  load(from: string, to: string, date: string, fetcher: typeof fetch): Promise<FxObservation | null>;
}

const DAY = 86_400_000;
const HEDGE_MS = 1_500;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);

async function json(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`rate source answered ${response.status}`);
  return response.json();
}

const SOURCES: FxSource[] = [
  {
    // European Central Bank reference rates, published each working day; weekends carry the last one.
    name: "ECB reference rates via Frankfurter",
    url: "https://frankfurter.dev/",
    async load(from, to, date, fetcher) {
      const start = dateOf(Date.parse(date) - 7 * DAY);
      const rows = await json(fetcher, `https://api.frankfurter.dev/v2/rates?${new URLSearchParams({ from: start, to: date, base: from, quotes: to })}`);
      if (!Array.isArray(rows)) return null;
      const best = rows
        .filter((row) => row && typeof row.date === "string" && row.date <= date && row.base === from && row.quote === to && positive(row.rate))
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      return best ? { rate: best.rate, date: best.date } : null;
    },
  },
  {
    // A daily snapshot of public rates for more than 200 currencies, served from a static CDN.
    name: "Daily public rates (fawazahmed0 currency-api)",
    url: "https://github.com/fawazahmed0/exchange-api",
    async load(from, to, date, fetcher) {
      const code = from.toLowerCase();
      for (const base of [`https://${date}.currency-api.pages.dev/v1/currencies/${code}.json`, `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${code}.json`]) {
        try {
          const body = await json(fetcher, base) as Record<string, unknown>;
          const rate = (body[code] as Record<string, unknown> | undefined)?.[to.toLowerCase()];
          if (positive(rate)) return { rate, date: typeof body.date === "string" ? body.date : date };
        } catch { /* try the mirror */ }
      }
      return null;
    },
  },
];

const cache = new Map<string, { source: FxSource; observation: FxObservation } | null>();

/** A reference rate on or just before a date, never in the future. */
async function rateOn(source: FxSource, from: string, to: string, date: string, today: string, fetcher: typeof fetch) {
  const day = date > today ? today : date;
  const key = `${source.name}|${from}|${to}|${day}`;
  if (day < today && cache.has(key)) return cache.get(key)!?.observation ?? null;
  try {
    const observation = await source.load(from, to, day, fetcher);
    if (observation && day < today) {
      if (cache.size > 400) cache.clear();
      cache.set(key, { source, observation });
    }
    return observation;
  } catch { return null; }
}

/**
 * How far the market moved between the quote date and the credit date, in
 * settlement currency per invoice currency. Null when no source could answer
 * for both days.
 */
export async function fxBetween(from: string, to: string, quoteDate: string, receivedDate: string, options: { fetcher?: typeof fetch; now?: Date } = {}): Promise<ReceiptFx | null> {
  if (from === to) return null;
  const fetcher = options.fetcher ?? fetch;
  const today = dateOf((options.now ?? new Date()).getTime());
  // A quote saved after the credit arrived cannot explain anything that happened before it.
  const start = quoteDate > receivedDate ? receivedDate : quoteDate;
  const attempt = async (source: FxSource): Promise<ReceiptFx | null> => {
    const [first, second] = start === receivedDate
      ? await rateOn(source, from, to, start, today, fetcher).then((value) => [value, value] as const)
      : await Promise.all([rateOn(source, from, to, start, today, fetcher), rateOn(source, from, to, receivedDate, today, fetcher)]);
    return first && second ? { source: source.name, sourceUrl: source.url, quoteDate: start, quoteRate: first.rate, receivedDate, receivedRate: second.rate } : null;
  };
  // The preferred source goes first. If it is slow, the next one starts alongside it after a moment
  // instead of after the first one gives up, so a stalled source never holds the credit up.
  for (let index = 0; index < SOURCES.length; index += 1) {
    const current = attempt(SOURCES[index]!);
    const next = SOURCES[index + 1];
    if (!next) return current;
    const early = await Promise.race([current, new Promise<"slow">((resolve) => setTimeout(() => resolve("slow"), HEDGE_MS))]);
    if (early === "slow") {
      const hedged = attempt(next);
      const first = await current;
      return first ?? hedged;
    }
    if (early) return early;
  }
  return null;
}
