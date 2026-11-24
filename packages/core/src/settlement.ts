import type { PriceBasis } from "./pricing.js";

/**
 * Quote-to-credit settlement. An invoice is quoted (what Railor expected to
 * arrive), later credited (what the bank actually received), and the
 * difference is split into what the market did, what the provider charged
 * and what nobody can explain.
 *
 *   credited = expected + FX move − explained deductions + unexplained
 *
 * Every figure is in the settlement currency (INR for most freelancers).
 * Market movement is measured between the quote date and the credit date with
 * one reference-rate source, so it is never confused with a hidden fee.
 */

/** A provider's price as it stood when the quote was saved. */
export interface QuoteSnapshot {
  providerSlug: string;
  providerName: string;
  product: string | null;
  basis: PriceBasis;
  /** Net settlement-currency amount the source said would arrive for the quoted invoice amount. */
  expected: number;
  feeAmount: number | null;
  feeCurrency: string | null;
  /** The provider's own rate, settlement currency per invoice currency. */
  rate: number | null;
  /** The source leaves out a cost; the expected amount is before it. */
  partial: boolean;
  missing: string[];
  sourceLabel: string;
  sourceUrl: string | null;
  observedAt: string | null;
  delivery: string | null;
  /** Whether the source says its fee already includes tax; null when it does not say. */
  taxIncluded?: boolean | null;
}

/** Reference rates around one receipt: settlement currency per invoice currency. */
export interface ReceiptFx {
  source: string;
  sourceUrl: string;
  quoteDate: string;
  quoteRate: number;
  receivedDate: string;
  receivedRate: number;
}

export interface SettlementDeduction { label: string; amount: number }

export type SettlementVerdict =
  /** Within rounding of the quote. */
  | "on_target"
  /** The gap is all market movement. */
  | "fx_only"
  /** Market movement and named charges account for the gap. */
  | "explained"
  /** Less arrived than the quote, the market and named charges account for. */
  | "short"
  /** More arrived than the quote, the market and named charges account for. */
  | "better";

export interface Settlement {
  expected: number;
  credited: number;
  /** credited − expected: negative when less arrived. */
  gap: number;
  gapPct: number | null;
  /** What the market move alone changed. Null when no reference rate was available. */
  fxMove: number | null;
  fxPct: number | null;
  fxChecked: boolean;
  fx: ReceiptFx | null;
  /** Charges that reduced the credit, as positive amounts. */
  deductions: SettlementDeduction[];
  deductionsTotal: number;
  /** What is left after the market and named charges: negative means money is missing. */
  unexplained: number;
  unexplainedPct: number | null;
  /** Differences smaller than this count as rounding. */
  tolerance: number;
  verdict: SettlementVerdict;
  /** The quote left out a cost, so a shortfall may be that cost. */
  quotePartial: boolean;
  quoteMissing: string[];
}

const cents = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number, of: number) => (of > 0 ? Math.round((value / of) * 10_000) / 100 : null);

/** Rate moves under a quarter of a percent, or under one whole unit, are rounding and fees' noise. */
export function settlementTolerance(expected: number) {
  return cents(Math.max(expected * 0.0025, 1));
}

export function fxMoveFor(expected: number, fx: Pick<ReceiptFx, "quoteRate" | "receivedRate"> | null): number | null {
  if (!fx || !(fx.quoteRate > 0) || !(fx.receivedRate > 0)) return null;
  return cents(expected * (fx.receivedRate / fx.quoteRate - 1));
}

interface Parts {
  expected: number;
  credited: number;
  fxMove: number | null;
  fx: ReceiptFx | null;
  deductions: SettlementDeduction[];
  quotePartial: boolean;
  quoteMissing: string[];
}

function classify(parts: Parts): Settlement {
  const expected = cents(parts.expected);
  const credited = cents(parts.credited);
  const gap = cents(credited - expected);
  const deductionsTotal = cents(parts.deductions.reduce((sum, item) => sum + item.amount, 0));
  const fxMove = parts.fxMove === null ? null : cents(parts.fxMove);
  const unexplained = cents(gap - (fxMove ?? 0) + deductionsTotal);
  const tolerance = settlementTolerance(expected);
  const verdict: SettlementVerdict = Math.abs(gap) <= tolerance ? "on_target"
    : Math.abs(unexplained) <= tolerance ? (deductionsTotal > 0 ? "explained" : "fx_only")
    : unexplained < 0 ? "short" : "better";
  return {
    expected, credited, gap, gapPct: pct(gap, expected),
    fxMove, fxPct: fxMove === null ? null : pct(fxMove, expected), fxChecked: fxMove !== null, fx: parts.fx,
    deductions: parts.deductions, deductionsTotal,
    unexplained, unexplainedPct: pct(unexplained, expected), tolerance, verdict,
    quotePartial: parts.quotePartial, quoteMissing: parts.quoteMissing,
  };
}

/**
 * One bank credit against the quote it was expected under. A credit that
 * covers part of the quoted amount is compared with the same part of the quote.
 */
export function settleReceipt(
  quote: { expected: number; quoteAmount: number; partial?: boolean; missing?: string[] },
  receipt: { allocated: number; credited: number; deductions?: SettlementDeduction[]; fx?: ReceiptFx | null },
): Settlement {
  const share = quote.quoteAmount > 0 ? Math.min(receipt.allocated / quote.quoteAmount, 1) : 1;
  const expected = quote.expected * share;
  return classify({
    expected, credited: receipt.credited, fx: receipt.fx ?? null, fxMove: fxMoveFor(expected, receipt.fx ?? null),
    deductions: (receipt.deductions ?? []).filter((item) => item.amount > 0),
    quotePartial: quote.partial ?? false, quoteMissing: quote.missing ?? [],
  });
}

/** Several credits for one invoice, judged together. */
export function combineSettlements(items: Settlement[]): Settlement | null {
  if (!items.length) return null;
  const checked = items.every((item) => item.fxMove !== null);
  return classify({
    expected: items.reduce((sum, item) => sum + item.expected, 0),
    credited: items.reduce((sum, item) => sum + item.credited, 0),
    fxMove: checked ? items.reduce((sum, item) => sum + (item.fxMove ?? 0), 0) : null,
    fx: items.at(-1)?.fx ?? null,
    deductions: items.flatMap((item) => item.deductions),
    quotePartial: items.some((item) => item.quotePartial),
    quoteMissing: [...new Set(items.flatMap((item) => item.quoteMissing))],
  });
}

/** Plain-language one-liner for each outcome; amounts are formatted by the caller. */
export const VERDICT_TITLE: Record<SettlementVerdict, string> = {
  on_target: "Arrived as quoted",
  fx_only: "The exchange rate moved — not a fee",
  explained: "Every rupee is accounted for",
  short: "Some money is unexplained",
  better: "More arrived than expected",
};

/**
 * Pick the quoted price a credit belongs to: the provider the credit came
 * through if the quote covered it, otherwise the one the user chose.
 */
export function pickQuote<T extends { providerSlug: string; providerName: string }>(candidates: T[], chosenSlug: string | null, providerName?: string | null): T | null {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const wanted = providerName ? norm(providerName) : "";
  if (wanted) {
    const named = candidates.find((item) => norm(item.providerName) === wanted || norm(item.providerSlug) === wanted)
      ?? candidates.find((item) => wanted.length >= 4 && (norm(item.providerName).includes(wanted) || wanted.includes(norm(item.providerName))));
    if (named) return named;
  }
  return candidates.find((item) => item.providerSlug === chosenSlug) ?? null;
}
