import type { PriceRow } from "@railor/core";
import { providerIdentity } from "./price-display";

export type PriceSortMode = "cheapest" | "fastest" | "lowest_fee" | "recommended" | "name";

/**
 * Parses human-readable delivery labels ("Instant", "in 24 minutes",
 * "1–2 business days", "Minutes - 24 hours", "Same day") into approximate
 * minimum arrival minutes so providers can be sorted fairly by speed.
 */
export function deliveryMinutes(label: string | null | undefined): number {
  if (!label) return Number.POSITIVE_INFINITY;
  const text = label.trim().toLowerCase();
  if (!text || /varies|depends|unknown|check provider|not published/.test(text)) return Number.POSITIVE_INFINITY;
  if (/\b(instant|immediately|real[- ]?time|seconds?)\b/.test(text)) return 1;
  if (/under\s*(an?|1)\s*min|within\s*(a\s*)?min/.test(text)) return 1;

  // Explicit numeric minutes (take the lower bound of ranges like "15–30 minutes")
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:[-–—to]+\s*\d+(?:\.\d+)?)?\s*(?:min|mins|minute|minutes)\b/);
  if (minMatch) return Math.max(1, Number(minMatch[1]));

  if (/\bminutes?\b/.test(text)) return 10;

  // Explicit numeric hours ("1–2 hours", "within 4 hours", "under 1 hour")
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:[-–—to]+\s*\d+(?:\.\d+)?)?\s*(?:hr|hrs|hour|hours)\b/);
  if (hourMatch) return Math.max(1, Number(hourMatch[1]) * 60);
  if (/\bunder\s*(?:an|1)\s*hour\b/.test(text)) return 45;
  if (/\bsame[- ]?day\b/.test(text)) return 360;
  if (/\bhours?\b/.test(text)) return 180;

  // Explicit numeric days ("1 business day", "1–2 days", "2-5 working days")
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:[-–—to]+\s*\d+(?:\.\d+)?)?\s*(?:business\s+|working\s+)?days?\b/);
  if (dayMatch) return Math.max(60, Number(dayMatch[1]) * 1440);
  if (/\bnext[- ]?(?:business[- ]?)?day\b/.test(text)) return 1440;

  return Number.POSITIVE_INFINITY;
}

/**
 * True percentage cost vs mid-market for ANY priced provider (including live
 * public calculators whose `totalCostPct` is left null because `partial` is true).
 * Lower is cheaper; negative means a promotional rate beats mid-market.
 */
export function effectiveCostPct(quote: PriceRow | undefined, amount: number, referenceRate: number | null | undefined): number {
  if (!quote || quote.recipientAmount == null) return Number.POSITIVE_INFINITY;
  if (quote.totalCostPct != null && Number.isFinite(quote.totalCostPct)) return quote.totalCostPct;
  if (referenceRate && referenceRate > 0 && amount > 0) {
    return (1 - quote.recipientAmount / (amount * referenceRate)) * 100;
  }
  return Number.POSITIVE_INFINITY;
}

export interface SortablePriceEntry {
  providerSlug: string;
  providerName: string;
  quote?: PriceRow;
}

export function sortPriceEntries<T extends SortablePriceEntry>(
  entries: T[],
  options: {
    sort: PriceSortMode;
    amount: number;
    referenceRate?: number | null;
    deliveryFor?: (entry: T) => string | null;
    activePromotions?: ReadonlySet<string>;
  },
): T[] {
  const { sort, deliveryFor, activePromotions } = options;
  const list = [...entries];

  const hasPayout = (e: T) => (e.quote?.recipientAmount != null ? 0 : 1);
  const payout = (e: T) => e.quote?.recipientAmount ?? Number.NEGATIVE_INFINITY;
  const fee = (e: T) => (e.quote?.feeAmount != null && Number.isFinite(e.quote.feeAmount) ? e.quote.feeAmount : Number.POSITIVE_INFINITY);
  const speed = (e: T) => deliveryMinutes(deliveryFor ? deliveryFor(e) : e.quote?.delivery);
  const promoted = (e: T) => Number(e.quote?.recipientAmount != null && Boolean(activePromotions?.has(providerIdentity(e.providerSlug))));

  if (sort === "cheapest") {
    list.sort((a, b) =>
      hasPayout(a) - hasPayout(b)
      || payout(b) - payout(a)
      || fee(a) - fee(b)
      || speed(a) - speed(b)
      || a.providerName.localeCompare(b.providerName));
  } else if (sort === "fastest") {
    list.sort((a, b) =>
      hasPayout(a) - hasPayout(b)
      || speed(a) - speed(b)
      || payout(b) - payout(a)
      || fee(a) - fee(b)
      || a.providerName.localeCompare(b.providerName));
  } else if (sort === "lowest_fee") {
    list.sort((a, b) =>
      hasPayout(a) - hasPayout(b)
      || fee(a) - fee(b)
      || payout(b) - payout(a)
      || speed(a) - speed(b)
      || a.providerName.localeCompare(b.providerName));
  } else if (sort === "name") {
    list.sort((a, b) => a.providerName.localeCompare(b.providerName));
  } else if (sort === "recommended") {
    list.sort((a, b) => promoted(b) - promoted(a));
  }
  return list;
}
