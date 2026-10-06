import { z } from "zod";
import { whereAlpha2 } from "iso-3166-1";
import type { PriceRow } from "./pricing.js";

const currencies = new Set(Intl.supportedValuesOf("currency"));
export const InvoiceCurrency = z.string().regex(/^[A-Z]{3}$/).refine((value) => currencies.has(value), "Choose a supported fiat currency.");
export function currencyDecimals(currency: string): number {
  InvoiceCurrency.parse(currency);
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
/** Exact base-10 minor units. Never reconcile money using binary floating point. */
export function moneyUnits(amount: string, currency: string): bigint {
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(amount)) throw new Error("Enter a plain decimal amount.");
  const decimals = currencyDecimals(currency);
  const [whole, rawFraction = ""] = amount.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > decimals) throw new Error(`${currency} supports ${decimals} decimal places.`);
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}
export function unitsMoney(units: bigint, currency: string): string {
  const decimals = currencyDecimals(currency);
  const scale = 10n ** BigInt(decimals);
  return decimals ? `${units / scale}.${(units % scale).toString().padStart(decimals, "0")}` : units.toString();
}
const amount = z.string().trim().max(24).regex(/^\d{1,12}(?:\.\d{1,4})?$/, "Enter a plain decimal amount.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date.");
const country = z.string().regex(/^[A-Z]{2}$/).refine((value) => Boolean(whereAlpha2(value)), "Choose a valid country.");
export const InvoiceDraft = z.object({
  invoiceNumber: z.string().trim().min(1).max(100),
  clientName: z.string().trim().min(1).max(160),
  clientCountry: country,
  accountCountry: country,
  currency: InvoiceCurrency,
  amount,
  settlementCurrency: InvoiceCurrency,
  dueDate: day.nullable().default(null),
  profile: z.enum(["freelancer", "sole_proprietor"]).default("freelancer"),
  purpose: z.enum(["services", "goods"]).default("services"),
}).superRefine((value, ctx) => {
  try {
    const units = moneyUnits(value.amount, value.currency);
    if (units <= 0n || units > moneyUnits("10000000", value.currency)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Invoice amount must be above zero and at most 10,000,000." });
  } catch (error) { ctx.addIssue({ code: "custom", path: ["amount"], message: (error as Error).message }); }
});
export type InvoiceDraft = z.infer<typeof InvoiceDraft>;
export const ReceiptDraft = z.object({
  reference: z.string().trim().min(1).max(120),
  providerName: z.string().trim().min(1).max(100),
  sourceAmount: amount,
  sourceCurrency: InvoiceCurrency,
  settlementAmount: amount,
  settlementCurrency: InvoiceCurrency,
  receivedDate: day,
  confirmed: z.literal(true),
  requestId: z.string().uuid(),
}).superRefine((value, ctx) => {
  for (const [field, currency] of [["sourceAmount", value.sourceCurrency], ["settlementAmount", value.settlementCurrency]] as const) {
    try { if (moneyUnits(value[field], currency) <= 0n) throw new Error("Receipt amounts must be above zero."); }
    catch (error) { ctx.addIssue({ code: "custom", path: [field], message: (error as Error).message }); }
  }
});
export type ReceiptDraft = z.infer<typeof ReceiptDraft>;

export function reconcileInvoice(invoice: { currency: string; amount: string }, receipts: Array<{ sourceCurrency: string; sourceAmount: string }>) {
  const total = moneyUnits(invoice.amount, invoice.currency);
  const received = receipts.reduce((sum, receipt) => {
    if (receipt.sourceCurrency !== invoice.currency) throw new Error("Receipt allocation must use the invoice currency.");
    return sum + moneyUnits(receipt.sourceAmount, invoice.currency);
  }, 0n);
  if (received > total) throw new Error("This receipt exceeds the outstanding invoice amount. Allocate only the amount covered by this invoice.");
  return { status: received === 0n ? "awaiting_payment" : received === total ? "recorded_paid" : "partially_paid", covered: unitsMoney(received, invoice.currency), outstanding: unitsMoney(total - received, invoice.currency), currency: invoice.currency } as const;
}

export interface InvoiceRouteEvidence {
  eligibility: "supported" | "additional_requirements" | "unknown" | "unavailable";
  score: number;
  outstandingRequirements: string[];
  reasons: string[];
}
export function rankInvoicePrices(rows: PriceRow[], routes: Map<string, InvoiceRouteEvidence>) {
  const candidates = rows.filter((row) => row.basis !== "market_estimate" && row.profileAssessment?.status !== "not_supported").map((row) => {
    const route = routes.get(row.providerSlug);
    const fit = row.profileAssessment?.status === "documented" && route && ["supported", "additional_requirements"].includes(route.eligibility);
    const canRecommend = Boolean(fit && !row.partial && row.recipientAmount !== null && Number.isFinite(row.recipientAmount));
    return { ...row, route: route ?? null, canRecommend };
  });
  candidates.sort((a, b) => Number(b.canRecommend) - Number(a.canRecommend)
    || Number(b.profileAssessment?.status === "documented") - Number(a.profileAssessment?.status === "documented")
    || Number(a.partial) - Number(b.partial)
    || (b.recipientAmount ?? 0) - (a.recipientAmount ?? 0)
    || (b.route?.score ?? 0) - (a.route?.score ?? 0));
  const recommended = candidates.find((row) => row.canRecommend) ?? null;
  const lowestEstimate = candidates.filter((row) => row.profileAssessment?.status === "documented" && !row.partial && row.recipientAmount !== null && row.route?.eligibility !== "unavailable").sort((a, b) => b.recipientAmount! - a.recipientAmount!)[0] ?? null;
  return { candidates, recommendedSlug: recommended?.providerSlug ?? null, lowestEstimateSlug: lowestEstimate?.providerSlug ?? null };
}

/** Model proposals are deliberately incomplete, and never contain bank credentials. */
export const ExtractedInvoice = z.object({
  invoiceNumber: z.string().max(100).nullable(), clientName: z.string().max(160).nullable(),
  clientCountry: country.nullable(), currency: InvoiceCurrency.nullable(), amount: amount.nullable(),
  dueDate: day.nullable(), warnings: z.array(z.string().max(200)).max(8),
});
export const ExtractedReceipt = z.object({
  reference: z.string().max(120).nullable(), providerName: z.string().max(100).nullable(),
  sourceAmount: amount.nullable(), sourceCurrency: InvoiceCurrency.nullable(),
  settlementAmount: amount.nullable(), settlementCurrency: InvoiceCurrency.nullable(),
  receivedDate: day.nullable(), warnings: z.array(z.string().max(200)).max(8),
});
