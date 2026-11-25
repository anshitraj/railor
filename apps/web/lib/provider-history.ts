import "server-only";
import { getDb, snapshotAmounts, snapshotHistory, type SnapshotDay } from "@railor/database";
import { loadRateHistory } from "./rate-history";

export const PROVIDER_HISTORY_RANGES = [7, 30, 90] as const;
export type ProviderHistoryDays = (typeof PROVIDER_HISTORY_RANGES)[number];

export interface ProviderHistoryDay {
  date: string;
  /** What the amount is worth at that day's reference rate; null on days the source published none. */
  midMarket: number | null;
  midMarketRate: number | null;
  quotes: SnapshotDay["quotes"];
}

export interface ProviderHistory {
  from: string;
  to: string;
  /** The amount the history is for: the requested one when Railor has it, else the closest it recorded. */
  amount: number;
  requested: number;
  profile: string;
  /** Other amounts with recorded history for this pair. */
  amounts: number[];
  days: ProviderHistoryDay[];
  recordedDays: number;
  reference: { source: string; sourceUrl: string };
}

const DAY = 86_400_000;
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * What arrived through each provider on each day Railor priced this pair,
 * beside the mid-market value of the same amount. Days without a recorded
 * quote come back with no quotes; nothing is filled in.
 */
export async function loadProviderHistory(input: { from: string; to: string; amount: number; profile: string; days: ProviderHistoryDays }, now = new Date()): Promise<ProviderHistory> {
  const db = await getDb();
  const start = Date.parse(dateOf(now.getTime())) - (input.days - 1) * DAY;
  const since = dateOf(start);
  const available = await snapshotAmounts(db, { from: input.from, to: input.to, profile: input.profile, since });
  const exact = available.find((row) => Math.abs(row.amount - input.amount) < 0.005);
  // Prefer the exact amount; otherwise the closest recorded amount, favouring ones with more days.
  const chosen = exact ?? [...available].sort((a, b) => Math.abs(Math.log(a.amount / input.amount)) - Math.abs(Math.log(b.amount / input.amount)) || b.days - a.days)[0];
  const amount = chosen?.amount ?? input.amount;
  const [recorded, reference] = await Promise.all([
    chosen ? snapshotHistory(db, { from: input.from, to: input.to, amount, profile: input.profile, since }) : Promise.resolve([]),
    loadRateHistory({ mode: "bank", from: input.from, to: input.to, days: input.days === 7 ? 7 : input.days === 30 ? 30 : 90 }, fetch, now).catch(() => null),
  ]);
  const byDate = new Map(recorded.map((day) => [day.date, day.quotes]));
  const rateOn = new Map((reference?.points ?? []).map((point) => [point.date, point.rate]));
  const days = Array.from({ length: input.days }, (_, index) => {
    const date = dateOf(start + index * DAY);
    const quotes = (byDate.get(date) ?? []).sort((a, b) => b.recipientAmount - a.recipientAmount);
    // The day's reference rate; where the published series has a gap, the rate Railor recorded with that day's quotes.
    const rate = rateOn.get(date) ?? quotes.find((quote) => quote.midMarketRate !== null)?.midMarketRate ?? null;
    return { date, midMarketRate: rate, midMarket: rate === null ? null : Math.round(amount * rate * 100) / 100, quotes };
  });
  return {
    from: input.from,
    to: input.to,
    amount,
    requested: input.amount,
    profile: input.profile,
    amounts: available.map((row) => row.amount).sort((a, b) => a - b).slice(0, 8),
    days,
    recordedDays: recorded.length,
    reference: { source: reference?.source ?? "Railor price checks", sourceUrl: reference?.sourceUrl ?? "https://frankfurter.dev/" },
  };
}
