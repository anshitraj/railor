/**
 * An independent mid-market rate, for when Wise has no public quote for a pair
 * (it returns no bank-transfer option for USD to SAR, for example) and a price
 * check would otherwise have no benchmark to measure every option against.
 *
 * It reads two public sources that need no key and takes the first to answer:
 *   - Frankfurter, which publishes central-bank and market reference rates;
 *   - a daily snapshot of public rates for 200+ currencies on a static CDN.
 * Both are daily mid-market rates, not live prices, and the source label says
 * so and says which day. A benchmark is a yardstick, never a price anyone can
 * trade at.
 */

export interface MidMarketRate {
  rate: number;
  source: string;
  /** When Railor read it. The rate itself is the day's, which the source label gives. */
  observedAt: string;
}

const TIMEOUT_MS = 3_500;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

async function json(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`rate source answered ${response.status}`);
  return response.json();
}

interface Source {
  label: string;
  read(from: string, to: string, fetcher: typeof fetch): Promise<{ rate: number; date: string }>;
}

const SOURCES: Source[] = [
  {
    label: "Frankfurter",
    async read(from, to, fetcher) {
      const rows = await json(fetcher, `https://api.frankfurter.dev/v2/rates?${new URLSearchParams({ base: from, quotes: to })}`);
      const row = Array.isArray(rows) ? rows.find((item) => item && item.base === from && item.quote === to && positive(item.rate)) : null;
      if (!row || typeof row.date !== "string") throw new Error("no rate for this pair");
      return { rate: row.rate, date: row.date };
    },
  },
  {
    label: "public daily rates",
    async read(from, to, fetcher) {
      const code = from.toLowerCase();
      let failure: unknown = new Error("no rate for this pair");
      for (const url of [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.json`, `https://latest.currency-api.pages.dev/v1/currencies/${code}.json`]) {
        try {
          const body = await json(fetcher, url) as Record<string, unknown>;
          const rate = (body[code] as Record<string, unknown> | undefined)?.[to.toLowerCase()];
          if (positive(rate) && typeof body.date === "string") return { rate, date: body.date };
        } catch (error) { failure = error; }
      }
      throw failure;
    },
  },
  {
    label: "ExchangeRate-API",
    async read(from, to, fetcher) {
      const body = await json(fetcher, `https://open.er-api.com/v6/latest/${from}`) as Record<string, unknown>;
      const rates = body.rates as Record<string, unknown> | undefined;
      const rate = rates?.[to];
      const updated = typeof body.time_last_update_utc === "string" ? Date.parse(body.time_last_update_utc) : NaN;
      if (body.result !== "success" || !positive(rate) || !Number.isFinite(updated)) throw new Error("no rate for this pair");
      return { rate, date: new Date(updated).toISOString().slice(0, 10) };
    },
  },
];

/** The day's mid-market rate for one pair, or null when no source has it. Never throws. */
export async function publicMidMarketRate(from: string, to: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<MidMarketRate | null> {
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) return null;
  const attempts = SOURCES.map(async (source) => {
    const { rate, date } = await source.read(from, to, fetcher);
    return { rate, source: `Daily mid-market rate from ${source.label}, ${shortDate(date)}`, observedAt: now.toISOString() } satisfies MidMarketRate;
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}
