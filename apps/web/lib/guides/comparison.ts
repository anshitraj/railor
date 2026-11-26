import type { PriceCheckResult, PriceRow } from "@railor/core";
import { benchmarkPayoutDifference } from "../price-cost";
import { pricingSourceLabel, providerIdentity } from "../price-display";
import { priceView } from "../price-view";
import { goHref } from "../provider-go";

/**
 * The comparison cards inside a guide: for one route and amount, the providers
 * a person could use side by side, with what arrives, the fee, the rate, the
 * markup against mid-market and the delivery time. Built from the same price
 * check as every other screen, so each figure has the source and time the
 * price check gives it. Nothing here is written into a guide's text.
 */

/** Where a sender in each currency is, for the price check's profile. */
export const SENDER_COUNTRY: Record<string, string> = { INR: "IN", USD: "US", GBP: "GB", EUR: "DE", CAD: "CA", AUD: "AU", AED: "AE", SGD: "SG" };

const AMOUNTS: Record<string, readonly number[]> = { INR: [50_000, 100_000, 500_000] };
const DEFAULT_AMOUNTS = [100, 500, 1_000, 5_000] as const;

export const compareAmounts = (from: string): readonly number[] => AMOUNTS[from] ?? DEFAULT_AMOUNTS;
export const defaultCompareAmount = (from: string): number => (from === "INR" ? 50_000 : 1_000);

/** The amount a visitor picked, limited to the amounts offered so a page can't be asked for anything else. */
export function compareAmount(from: string, value: string | undefined): number {
  const amount = Number(value);
  return compareAmounts(from).includes(amount) ? amount : defaultCompareAmount(from);
}

export function currencyText(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

type PaymentMethod = NonNullable<PriceRow["paymentMethods"]>[number];
const METHOD_NAME: Partial<Record<PaymentMethod, string>> = { local_bank: "Bank transfer", wire: "International wire", card: "Card", transfer_service: "Transfer app" };

/** How the price is paid for, in the price check's own words; null when the row doesn't say. */
export function fundingText(row: Pick<PriceRow, "publicOffer" | "fundingLabel" | "paymentMethods">): string | null {
  if (row.publicOffer?.fundingMethod) return row.publicOffer.fundingMethod;
  if (row.fundingLabel) return row.fundingLabel;
  const methods = (row.paymentMethods ?? []).filter((method) => method !== "transfer_service");
  const names = (methods.length ? methods : row.paymentMethods ?? []).map((method) => METHOD_NAME[method]).filter((name): name is string => Boolean(name));
  return names.length ? names.join(" / ") : null;
}

export interface ComparisonColumn {
  slug: string;
  name: string;
  logoUrl?: string;
  /** What the recipient receives, formatted. */
  receives: string;
  /** The provider's fee, or a plain statement that it isn't known. */
  fee: string;
  /** The rate used, or null when the row has none. */
  rate: string | null;
  /** Fee and exchange rate together, against mid-market, as a signed percentage; null when a cost is unknown. */
  markup: string | null;
  delivery: string | null;
  payment: string | null;
  /** Where the price comes from. */
  source: string;
  /** A dated consumer estimate rather than a current price. */
  estimate: boolean;
  href: string | null;
}

export interface RouteComparisonData {
  reference: number | null;
  generatedAt: string | null;
  columns: ComparisonColumn[];
}

export function comparisonColumns(result: PriceCheckResult | null, now: number, from: string, to: string, amount: number, limit = 4): RouteComparisonData {
  const { quotes, estimates } = priceView(result, now);
  const priced = [...quotes, ...estimates].filter((row) => row.recipientAmount !== null);
  const byAmount = (a: PriceRow, b: PriceRow) => b.recipientAmount! - a.recipientAmount!;
  // Current prices by what arrives, then dated estimates, one per provider.
  const ordered = [...priced.filter((row) => row.basis !== "market_estimate").sort(byAmount), ...priced.filter((row) => row.basis === "market_estimate").sort(byAmount)];
  const seen = new Set<string>();
  const columns: ComparisonColumn[] = [];
  for (const row of ordered) {
    const slug = providerIdentity(row.providerSlug);
    if (seen.has(slug)) continue;
    seen.add(slug);
    // How far what arrives sits from the mid-market amount: the fee and the rate together, even when a provider's own fee is unknown.
    const reference = result?.reference?.rate ?? null;
    const gap = reference ? benchmarkPayoutDifference(row.recipientAmount, amount, reference, to) : null;
    columns.push({
      slug,
      name: row.providerName.split(" · ")[0]!,
      ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
      receives: currencyText(row.recipientAmount!, to),
      fee: row.feeAmount === null ? "Check fee" : currencyText(row.feeAmount, row.feeCurrency ?? from),
      rate: row.rate === null ? null : row.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 }),
      markup: gap?.kind === "cost" ? `${gap.bps < 0 ? "−" : ""}${(Math.abs(gap.bps) / 100).toFixed(2)}%` : null,
      delivery: row.delivery,
      payment: fundingText(row),
      source: row.basis === "market_estimate" ? "Dated estimate" : pricingSourceLabel(row),
      estimate: row.basis === "market_estimate",
      href: goHref(slug, { from, to, amount }),
    });
    if (columns.length === limit) break;
  }
  return { reference: result?.reference?.rate ?? null, generatedAt: result?.generatedAt ?? null, columns };
}
