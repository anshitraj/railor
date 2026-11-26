import type { PriceRow } from "@railor/core";
import { providerIdentity } from "./price-display";
import type { AlertFrequency } from "./plans";

export interface BestPrice {
  amount: number;
  providerSlug: string;
  providerName: string;
  product?: string;
  basis: PriceRow["basis"];
  /** The provider's own delivery estimate, when the price gives one. */
  delivery?: string | null;
}

/**
 * Prices an alert may be judged on: an exact, live public or published price
 * whose costs are all known and that applies to this profile. Market estimates
 * and partial rows never trigger an email.
 */
export function completePrices(rows: PriceRow[], providerSlug?: string): BestPrice[] {
  const wanted = providerSlug ? providerIdentity(providerSlug) : null;
  return rows
    .filter((row) => row.basis !== "market_estimate" && !row.partial && row.costComplete !== false
      && row.profileAssessment?.status !== "not_supported"
      && typeof row.recipientAmount === "number" && Number.isFinite(row.recipientAmount) && row.recipientAmount > 0
      && (!wanted || providerIdentity(row.providerSlug) === wanted))
    .map((row) => ({ amount: row.recipientAmount!, providerSlug: providerIdentity(row.providerSlug), providerName: row.providerName.split(" · ")[0]!, product: row.product?.label, basis: row.basis, delivery: row.delivery }))
    .sort((a, b) => b.amount - a.amount);
}

export function bestCompletePrice(rows: PriceRow[], providerSlug?: string): BestPrice | null {
  return completePrices(rows, providerSlug)[0] ?? null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** The cron runs once a day, so a 7-day gap lands a few seconds short of 7 days; two hours of slack keeps the rhythm. */
const SLACK_MS = 2 * HOUR_MS;
/** How far the best price must move since the last update before a smart update is sent. */
export const PRICE_CHANGE_PCT = 0.5;

export type DigestReason = "scheduled" | "change";

/**
 * Whether to email an update for this subscription now.
 *  - daily: every day;
 *  - weekly: every seven days;
 *  - smart: at most once a day, and only when the best complete price has moved
 *    by PRICE_CHANGE_PCT since the last update.
 * A subscription with no baseline yet starts counting from this check instead
 * of emailing at once, so turning alerts on never mails a backlog.
 */
export function updateDecision(
  frequency: AlertFrequency,
  state: { lastDigestAt: Date | null; lastDigestAmount: number | null },
  best: BestPrice | null,
  now: Date,
): { send: boolean; reason?: DigestReason; baseline?: boolean } {
  if (!best) return { send: false };
  if (!state.lastDigestAt) return { send: false, baseline: true };
  const since = now.getTime() - state.lastDigestAt.getTime();
  if (frequency === "daily" && since >= DAY_MS - SLACK_MS) return { send: true, reason: "scheduled" };
  if (frequency === "weekly" && since >= 7 * DAY_MS - SLACK_MS) return { send: true, reason: "scheduled" };
  if (frequency === "smart" && state.lastDigestAmount && since >= DAY_MS - SLACK_MS) {
    const moved = Math.abs(best.amount - state.lastDigestAmount) / state.lastDigestAmount * 100;
    if (moved >= PRICE_CHANGE_PCT) return { send: true, reason: "change" };
  }
  return { send: false };
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(amount).replace(/ /g, " ");
  } catch {
    return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
}
