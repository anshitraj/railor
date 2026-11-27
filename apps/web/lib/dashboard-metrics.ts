/**
 * The arithmetic behind the dashboard home: daily series, part-to-whole shares,
 * period-over-period change and the "extra found" figure. Pure functions over
 * already-loaded rows, so they are tested without a database and the numbers
 * on screen can always be traced back to recorded events.
 * Client-safe: no server imports.
 */

export const DASHBOARD_DAYS = 30;

/** A recorded price check, as stored in product_events.data by lib/activity. */
export interface PriceCheckData {
  from: string;
  to: string;
  amount: number;
  /** Highest amount the recipient gets among priced options. */
  best: number | null;
  bestProvider?: string | null;
  /** Middle option among priced options; the best is measured against it. */
  median: number | null;
  options: number;
}

export interface ProviderOpenData {
  provider: string;
  name: string;
  from?: string | null;
  to?: string | null;
}

export interface DayPoint {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  checks: number;
  visits: number;
  payments: number;
}

export interface Share {
  key: string;
  label: string;
  count: number;
}

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** The last `days` UTC days ending today, oldest first. */
export function dayRange(days: number, now: Date): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => dayKey(new Date(end - (days - 1 - i) * 86_400_000)));
}

/** Counts per day for each series; anything outside the window is ignored. */
export function dailySeries(
  events: { checks: Date[]; visits: Date[]; payments: Date[] },
  days: number,
  now: Date,
): DayPoint[] {
  const points = dayRange(days, now).map((day) => ({ day, checks: 0, visits: 0, payments: 0 }));
  const byDay = new Map(points.map((point) => [point.day, point]));
  for (const key of ["checks", "visits", "payments"] as const) {
    for (const at of events[key]) {
      const point = byDay.get(dayKey(at));
      if (point) point[key] += 1;
    }
  }
  return points;
}

/** The biggest `max` groups by count, then everything else folded into "Other". Ties keep the first seen. */
export function topShares(items: Array<{ key: string; label: string }>, max = 4): Share[] {
  const counts = new Map<string, Share>();
  for (const item of items) {
    const entry = counts.get(item.key) ?? { key: item.key, label: item.label, count: 0 };
    entry.count += 1;
    counts.set(item.key, entry);
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count);
  if (sorted.length <= max + 1) return sorted;
  const rest = sorted.slice(max).reduce((sum, entry) => sum + entry.count, 0);
  return [...sorted.slice(0, max), { key: "other", label: "Other", count: rest }];
}

/** Change against the previous period, as a whole percentage. Null when there is nothing to compare with. */
export function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * How much more the best option paid than the middle option, summed over the
 * checks of the most-checked destination currency. Only checks with at least
 * two priced options count: with one option there is nothing to have found.
 */
export function extraFound(checks: PriceCheckData[]): { currency: string; amount: number; checks: number } | null {
  const usable = checks.filter((check) => check.options >= 2 && typeof check.best === "number" && typeof check.median === "number" && check.best >= check.median);
  if (!usable.length) return null;
  const byCurrency = new Map<string, PriceCheckData[]>();
  for (const check of usable) byCurrency.set(check.to, [...(byCurrency.get(check.to) ?? []), check]);
  const [currency, list] = [...byCurrency.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  const amount = list.reduce((sum, check) => sum + (check.best! - check.median!), 0);
  return { currency, amount: Math.round(amount * 100) / 100, checks: list.length };
}

/** Middle value of a list (mean of the two middle values for an even count). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A greeting for the hour where the person is; the server falls back to UTC. */
export function greeting(now: Date, timeZone = "UTC"): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** One sentence of what needs attention, built only from counts the page also shows. */
export function summaryLine(input: { needs: number; checks: number; topRoute: string | null; payments: number }): string {
  const parts: string[] = [];
  if (input.needs) parts.push(`${input.needs} ${input.needs === 1 ? "thing needs" : "things need"} you`);
  if (input.checks) parts.push(`${input.checks} price ${input.checks === 1 ? "check" : "checks"} in the last 30 days${input.topRoute ? `, mostly ${input.topRoute}` : ""}`);
  if (input.payments) parts.push(`${input.payments} ${input.payments === 1 ? "payment" : "payments"} this month`);
  return parts.length ? `${parts.join(" · ")}.` : "Compare a transfer to start your activity history.";
}
