import type { PriceRow } from "@railor/core";
import { providerIdentity } from "./price-display";

/** How much more than today's best should arrive before Railor emails: click-only choices. */
export const ALERT_STEPS = [0.5, 1, 2] as const;
export type AlertStep = (typeof ALERT_STEPS)[number];

/** At most one email per alert a day, even when a price flickers across the target. */
export const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface BestPrice {
  amount: number;
  providerSlug: string;
  providerName: string;
  product?: string;
  basis: PriceRow["basis"];
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
    .map((row) => ({ amount: row.recipientAmount!, providerSlug: providerIdentity(row.providerSlug), providerName: row.providerName, product: row.product?.label, basis: row.basis }))
    .sort((a, b) => b.amount - a.amount);
}

export function bestCompletePrice(rows: PriceRow[], providerSlug?: string): BestPrice | null {
  return completePrices(rows, providerSlug)[0] ?? null;
}

/** Today's best plus the chosen step, rounded up to the cent. */
export function alertTarget(baseline: number, step: number): number {
  return Math.ceil(baseline * (1 + step / 100) * 100) / 100;
}

/**
 * Email on the check where the best complete price first reaches the target,
 * then stay quiet until it drops below and comes back — and never twice in a day.
 * With no complete price this run, nothing changes.
 */
export function alertDecision(state: { targetAmount: number; lastMet: boolean; lastNotifiedAt: Date | null }, best: BestPrice | null, now: Date) {
  if (!best) return { met: state.lastMet, notify: false };
  const met = best.amount >= state.targetAmount;
  const cooled = !state.lastNotifiedAt || now.getTime() - state.lastNotifiedAt.getTime() >= NOTIFY_COOLDOWN_MS;
  return { met, notify: met && !state.lastMet && cooled };
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(amount).replace(/ /g, " ");
  } catch {
    return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
}
