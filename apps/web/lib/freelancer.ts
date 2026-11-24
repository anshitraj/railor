import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { freelancerInvoices, freelancerReceipts, freelancerRouteChecks, freelancerSettlementAnalyses, getDb, providers } from "@railor/database";
import { InvoiceDraft, KNOWN_PROVIDER_SITES, ReceiptDeduction, ReceiptDraft, combineSettlements, investigateShortfall, moneyUnits, pickQuote, reconcileInvoice, rankInvoicePrices, registrableDomain, searchCorridors, settleReceipt, type InvoiceRouteEvidence, type QuoteSnapshot, type ReceiptFx, type ShortfallReport } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { getSatisfiedRequirements } from "./org";
import { runPriceCheck } from "./pricing";
import { fxBetween } from "./fx-history";

export class InvoiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function findInvoice(org: string, id: string) {
  const db = await getDb();
  const [invoice] = await db.select().from(freelancerInvoices).where(and(eq(freelancerInvoices.organizationId, org), eq(freelancerInvoices.id, id))).limit(1);
  if (!invoice) throw new InvoiceError("Invoice not found in this workspace.", 404);
  return invoice;
}
export async function invoiceReceipts(org: string, id: string) {
  const db = await getDb();
  return db.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), eq(freelancerReceipts.invoiceId, id))).orderBy(desc(freelancerReceipts.createdAt));
}
export async function listInvoices(org: string) {
  const db = await getDb();
  const invoices = await db.select().from(freelancerInvoices).where(eq(freelancerInvoices.organizationId, org)).orderBy(desc(freelancerInvoices.createdAt)).limit(100);
  const receipts = invoices.length ? await db.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), inArray(freelancerReceipts.invoiceId, invoices.map((i) => i.id)))) : [];
  return invoices.map((invoice) => ({ ...invoice, ...reconcileInvoice(invoice, receipts.filter((r) => r.invoiceId === invoice.id)) }));
}
export type FreelancerInvoice = Awaited<ReturnType<typeof listInvoices>>[number];
export async function saveInvoice(org: string, user: string, input: unknown) {
  const draft = InvoiceDraft.parse(input);
  const db = await getDb();
  const [saved] = await db.insert(freelancerInvoices).values({ ...draft, organizationId: org, createdBy: user }).returning();
  return saved!;
}

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const KEEP_CHECKS = 10;

/**
 * Save a bank credit against an invoice. Only the credited amount and the
 * date are needed: the provider, covered amount and reference default from
 * the quote and the invoice, and the credit is judged against the quote that
 * was live when the user chose a route.
 */
export async function recordInvoiceReceipt(org: string, user: string, id: string, input: unknown) {
  const draft = ReceiptDraft.parse(input);
  const db = await getDb();
  // Lookups and network calls happen before the locked transaction, never inside it.
  const [invoiceRow] = await db.select().from(freelancerInvoices).where(and(eq(freelancerInvoices.organizationId, org), eq(freelancerInvoices.id, id))).limit(1);
  if (!invoiceRow) throw new InvoiceError("Invoice not found in this workspace.", 404);
  const check = await latestCheck(org, id);
  const quote = check ? pickQuote(check.candidates as unknown as QuoteSnapshot[], check.chosenSlug, draft.providerName) : null;
  const settlementCurrency = draft.settlementCurrency ?? invoiceRow.settlementCurrency;
  const fx: ReceiptFx | null = check && quote
    ? await fxBetween(invoiceRow.currency, settlementCurrency, dateOnly(check.createdAt), draft.receivedDate).catch(() => null)
    : null;
  return db.transaction(async (tx) => {
    // Serialize allocations for this invoice so concurrent receipts cannot overpay it.
    const [invoice] = await tx.select().from(freelancerInvoices).where(and(eq(freelancerInvoices.organizationId, org), eq(freelancerInvoices.id, id))).for("update");
    if (!invoice) throw new InvoiceError("Invoice not found in this workspace.", 404);
    const [previous] = await tx.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), eq(freelancerReceipts.requestId, draft.requestId)));
    if (previous) {
      // A retry repeats what the user sent; defaults that depend on today's balance are not compared.
      const same = previous.invoiceId === id && previous.receivedDate === draft.receivedDate
        && moneyUnits(previous.settlementAmount, previous.settlementCurrency) === moneyUnits(draft.settlementAmount, previous.settlementCurrency)
        && (draft.reference === undefined || previous.reference === draft.reference)
        && (draft.providerName === undefined || previous.providerName === draft.providerName)
        && (draft.sourceCurrency === undefined || previous.sourceCurrency === draft.sourceCurrency)
        && (draft.settlementCurrency === undefined || previous.settlementCurrency === draft.settlementCurrency)
        && (draft.sourceAmount === undefined || moneyUnits(previous.sourceAmount, previous.sourceCurrency) === moneyUnits(draft.sourceAmount, previous.sourceCurrency));
      if (!same) throw new InvoiceError("This retry ID already belongs to a different receipt.", 409);
      return previous;
    }
    const receipts = await tx.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), eq(freelancerReceipts.invoiceId, id)));
    const balance = reconcileInvoice(invoice, receipts);
    const resolved = {
      reference: (draft.reference ?? `RCPT-${invoice.invoiceNumber}-${draft.requestId.slice(0, 8)}`).slice(0, 120),
      providerName: draft.providerName ?? quote?.providerName ?? "Not specified",
      sourceCurrency: draft.sourceCurrency ?? invoice.currency,
      sourceAmount: draft.sourceAmount ?? balance.outstanding,
      settlementCurrency,
      settlementAmount: draft.settlementAmount,
      receivedDate: draft.receivedDate,
      requestId: draft.requestId,
    };
    try {
      if (moneyUnits(resolved.sourceAmount, resolved.sourceCurrency) <= 0n) throw new InvoiceError("This invoice is already fully covered by recorded receipts.");
      if (resolved.settlementCurrency !== invoice.settlementCurrency) throw new InvoiceError("The bank credit must use this invoice's settlement currency.");
      moneyUnits(resolved.settlementAmount, resolved.settlementCurrency);
      for (const item of draft.deductions) moneyUnits(item.amount, resolved.settlementCurrency);
      reconcileInvoice(invoice, [...receipts, resolved]);
    } catch (error) {
      if (error instanceof InvoiceError) throw error;
      throw new InvoiceError((error as Error).message);
    }
    const [receipt] = await tx.insert(freelancerReceipts).values({
      ...resolved, organizationId: org, invoiceId: id, recordedBy: user,
      routeCheckId: check && quote ? check.id : null, quoteSlug: quote?.providerSlug ?? null,
      deductions: draft.deductions, fx: fx as unknown as Record<string, unknown> | null,
    }).returning();
    return receipt!;
  });
}

/* ------------------------------ Saved quotes ------------------------------ */

/** What the quote card shows: the price the user chose, and the others it was ranked against. */
export interface InvoiceQuote {
  checkId: string;
  quotedAt: string;
  amount: string;
  currency: string;
  settlementCurrency: string;
  paymentMethod: string;
  referenceRate: number | null;
  referenceSource: string | null;
  chosen: QuoteSnapshot | null;
  candidates: QuoteSnapshot[];
}

async function latestCheck(org: string, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(freelancerRouteChecks)
    .where(and(eq(freelancerRouteChecks.organizationId, org), eq(freelancerRouteChecks.invoiceId, id)))
    .orderBy(desc(freelancerRouteChecks.createdAt)).limit(1);
  return row ?? null;
}

function toQuote(check: typeof freelancerRouteChecks.$inferSelect): InvoiceQuote {
  const candidates = check.candidates as unknown as QuoteSnapshot[];
  return {
    checkId: check.id, quotedAt: check.createdAt.toISOString(), amount: check.amount, currency: check.currency, settlementCurrency: check.settlementCurrency,
    paymentMethod: check.paymentMethod, referenceRate: check.referenceRate === null ? null : Number(check.referenceRate), referenceSource: check.referenceSource,
    chosen: candidates.find((item) => item.providerSlug === check.chosenSlug) ?? null, candidates,
  };
}

export async function invoiceQuote(org: string, id: string): Promise<InvoiceQuote | null> {
  const check = await latestCheck(org, id);
  return check ? toQuote(check) : null;
}

/** The user picks a provider from the latest comparison; that price becomes the quote their credit is judged against. */
export async function chooseQuote(org: string, id: string, checkId: string, providerSlug: string): Promise<InvoiceQuote> {
  await findInvoice(org, id);
  const check = await latestCheck(org, id);
  if (!check || check.id !== checkId) throw new InvoiceError("These prices are out of date. Compare routes again.", 409);
  if (!(check.candidates as unknown as QuoteSnapshot[]).some((item) => item.providerSlug === providerSlug)) throw new InvoiceError("That provider is not in this comparison.", 400);
  const db = await getDb();
  const [updated] = await db.update(freelancerRouteChecks).set({ chosenSlug: providerSlug, chosenAt: new Date() }).where(eq(freelancerRouteChecks.id, check.id)).returning();
  return toQuote(updated!);
}

type RankedRow = ReturnType<typeof rankInvoicePrices>["candidates"][number];
function snapshot(row: RankedRow): QuoteSnapshot | null {
  if (row.recipientAmount === null || !Number.isFinite(row.recipientAmount) || row.recipientAmount <= 0) return null;
  return {
    providerSlug: row.providerSlug, providerName: row.providerName, product: row.product?.label ?? null, basis: row.basis, expected: row.recipientAmount,
    feeAmount: row.feeAmount, feeCurrency: row.feeCurrency, rate: row.rate, partial: row.partial, missing: row.missing ?? [],
    sourceLabel: row.source.label, sourceUrl: row.source.url ?? null, observedAt: row.observedAt || null, delivery: row.delivery, taxIncluded: row.taxIncluded ?? null,
  };
}

async function saveRouteCheck(org: string, user: string, invoice: { id: string; currency: string; settlementCurrency: string }, input: {
  paymentMethod: string; amount: string; recommendedSlug: string | null; candidates: RankedRow[]; reference: { rate: number; source: string } | null;
}) {
  const candidates = input.candidates.flatMap((row) => snapshot(row) ?? []).slice(0, 8);
  if (!candidates.length) return null;
  const db = await getDb();
  // The best-documented price, else the top-ranked one: the user can switch with one tap, but never starts with nothing to compare against.
  const chosen = (candidates.find((item) => item.providerSlug === input.recommendedSlug) ?? candidates[0])?.providerSlug ?? null;
  const [check] = await db.insert(freelancerRouteChecks).values({
    organizationId: org, invoiceId: invoice.id, paymentMethod: input.paymentMethod, amount: input.amount, currency: invoice.currency, settlementCurrency: invoice.settlementCurrency,
    referenceRate: input.reference ? String(input.reference.rate) : null, referenceSource: input.reference?.source ?? null,
    candidates: candidates as unknown as Array<Record<string, unknown>>, chosenSlug: chosen, chosenAt: chosen ? new Date() : null, createdBy: user,
  }).returning();
  // Old comparisons only matter while a credit is judged against them.
  await db.execute(sql`delete from freelancer_route_checks where organization_id = ${org} and invoice_id = ${invoice.id}
    and id not in (select id from freelancer_route_checks where organization_id = ${org} and invoice_id = ${invoice.id} order by created_at desc limit ${KEEP_CHECKS})
    and id not in (select route_check_id from freelancer_receipts where route_check_id is not null)`);
  return check!;
}

/* ------------------------------- Settlement ------------------------------- */

export type SettledReceipt = Awaited<ReturnType<typeof settledReceipts>>[number];

/** Each receipt with the quote it was expected under and how the credit compares. */
export async function settledReceipts(org: string, id: string) {
  const receipts = await invoiceReceipts(org, id);
  const ids = [...new Set(receipts.flatMap((receipt) => receipt.routeCheckId ?? []))];
  const db = await getDb();
  const checks = ids.length ? await db.select().from(freelancerRouteChecks).where(and(eq(freelancerRouteChecks.organizationId, org), inArray(freelancerRouteChecks.id, ids))) : [];
  return receipts.map((receipt) => {
    const check = checks.find((item) => item.id === receipt.routeCheckId);
    const quote = check ? (check.candidates as unknown as QuoteSnapshot[]).find((item) => item.providerSlug === receipt.quoteSlug) ?? null : null;
    const settlement = check && quote ? settleReceipt(
      { expected: quote.expected, quoteAmount: Number(check.amount), partial: quote.partial, missing: quote.missing },
      { allocated: Number(receipt.sourceAmount), credited: Number(receipt.settlementAmount), deductions: receipt.deductions.map((item) => ({ label: item.label, amount: Number(item.amount) })), fx: receipt.fx as unknown as ReceiptFx | null },
    ) : null;
    return { ...receipt, quote, settlement, quoteAmount: check ? Number(check.amount) : null };
  });
}

const receiptKey = (receipts: Array<{ id: string }>) => receipts.map((receipt) => receipt.id).sort().join(",");

/** Everything the settlement panel needs in one call, including the last investigation if it is still about these credits. */
export async function invoiceSettlement(org: string, id: string) {
  const db = await getDb();
  const [receipts, quote, [stored]] = await Promise.all([
    settledReceipts(org, id), invoiceQuote(org, id),
    db.select().from(freelancerSettlementAnalyses).where(and(eq(freelancerSettlementAnalyses.organizationId, org), eq(freelancerSettlementAnalyses.invoiceId, id))).limit(1),
  ]);
  const analysis = stored && stored.receiptKey === receiptKey(receipts) ? stored.report as unknown as ShortfallReport : null;
  return { receipts, quote, combined: combineSettlements(receipts.flatMap((receipt) => receipt.settlement ?? [])), analysis };
}
export type InvoiceSettlementView = Awaited<ReturnType<typeof invoiceSettlement>>;

export async function routeInvoice(org: string, user: string, id: string, paymentMethod?: "local_bank" | "wire" | "card" | "transfer_service") {
  const invoice = await findInvoice(org, id);
  const receipts = await invoiceReceipts(org, id);
  const balance = reconcileInvoice(invoice, receipts);
  if (balance.status === "recorded_paid") throw new InvoiceError("This invoice has already been recorded as paid.");
  const amount = Number(balance.outstanding);
  // Compare one way of paying at a time, as the price page does; a client invoice usually arrives by bank transfer.
  const method = paymentMethod ?? "local_bank";
  // A freelancer's service export is commercial collection, not a personal remittance.
  const query = CorridorQuery.parse({ entityCountry: invoice.accountCountry, customerType: "business", sourceCountry: invoice.clientCountry, sourceCurrency: invoice.currency, destinationCountry: invoice.accountCountry, destinationCurrency: invoice.settlementCurrency, product: "collection", endpointType: "bank_account", amount, amountCurrency: invoice.currency });
  const satisfiedRequirements = await getSatisfiedRequirements(org);
  const [routing, prices] = await Promise.all([
    searchCorridors(query, { organizationId: org, satisfiedRequirements, preset: "cheapest", recordTelemetry: false, includeDemoProviders: false }),
    runPriceCheck(org, { sourceCurrency: invoice.currency, destinationCurrency: invoice.settlementCurrency, destinationCountry: invoice.accountCountry, amount, includeMarket: false, context: { profile: invoice.profile, country: invoice.accountCountry, direction: "receive", purpose: invoice.purpose, paymentMethod: method } }),
  ]);
  const evidence = new Map<string, InvoiceRouteEvidence>(routing.results.map((r) => [r.provider.slug, { eligibility: r.eligibility, score: r.score, outstandingRequirements: r.outstandingRequirements, reasons: r.reasons.map((reason) => reason.message) }]));
  const ranked = rankInvoicePrices(prices.rows, evidence);
  // The recommended price is saved as this invoice's quote straight away; picking another provider replaces it.
  const check = await saveRouteCheck(org, user, invoice, { paymentMethod: method, amount: balance.outstanding, recommendedSlug: ranked.recommendedSlug, candidates: ranked.candidates, reference: prices.reference ? { rate: prices.reference.rate, source: prices.reference.source } : null });
  return {
    ...ranked, reference: prices.reference, checkId: check?.id ?? null, chosenSlug: check?.chosenSlug ?? null, generatedAt: prices.generatedAt, amount: balance.outstanding,
    currency: invoice.currency, settlementCurrency: invoice.settlementCurrency,
    routeOptions: routing.results.filter((r) => r.eligibility !== "unavailable").slice(0, 8).map((r) => ({ providerSlug: r.provider.slug, providerName: r.provider.name, ...evidence.get(r.provider.slug)!, settlement: r.facts.settlementSummary ?? null, sources: r.evidence.map((e) => ({ url: e.sourceUrl, title: e.sourceTitle })) })),
    unavailable: prices.unavailable,
    paymentMethod: method,
  };
}
export type InvoiceRouting = Awaited<ReturnType<typeof routeInvoice>>;

export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+@\-]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function invoiceCsv(org: string, id: string) {
  const invoice = await findInvoice(org, id);
  const receipts = await settledReceipts(org, id);
  const balance = reconcileInvoice(invoice, receipts);
  const rows: unknown[][] = [["Invoice", "Client", "Invoice currency", "Invoice amount", "Outstanding", "Status", "Receipt reference", "Provider", "Allocated amount", "Allocated currency", "Bank credit", "Bank currency", "Received date", "Confirmation", "Expected credit", "Exchange-rate move", "Named charges", "Unexplained difference"]];
  for (const receipt of receipts.length ? receipts : [null]) {
    const settled = receipt?.settlement;
    rows.push([invoice.invoiceNumber, invoice.clientName, invoice.currency, invoice.amount, balance.outstanding, balance.status, receipt?.reference, receipt?.providerName, receipt?.sourceAmount, receipt?.sourceCurrency, receipt?.settlementAmount, receipt?.settlementCurrency, receipt?.receivedDate, receipt ? "Recorded manually by user" : "Awaiting payment", settled?.expected, settled?.fxMove ?? (settled ? "not checked" : ""), settled?.deductionsTotal, settled?.unexplained]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/* ------------------------- Where did the money go? ------------------------- */

/** The provider's own website, so a page on it counts as official: the registry first, then what Railor already knows, then the page the quote came from. */
async function providerDomain(slug: string, sourceUrl: string | null): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select({ website: providers.websiteUrl }).from(providers).where(eq(providers.slug, slug)).limit(1);
  const site = row?.website || KNOWN_PROVIDER_SITES[slug] || sourceUrl;
  const domain = site ? registrableDomain(site) : "";
  return domain || null;
}

/**
 * Ask Gemini where the missing money could have gone, using the provider's own
 * pages. Only for an invoice whose credit is short by more than rounding after
 * the market and named charges; the answer is saved with the credits it was for.
 */
export async function investigateInvoice(org: string, id: string): Promise<ShortfallReport> {
  const invoice = await findInvoice(org, id);
  const view = await invoiceSettlement(org, id);
  const settled = view.receipts.filter((receipt) => receipt.quote && receipt.settlement && receipt.quoteAmount);
  if (!view.combined || view.combined.verdict !== "short" || !settled.length) throw new InvoiceError("Nothing is missing from this invoice's credit.");
  const lead = settled[0]!;
  const quote = lead.quote!;
  const check = await latestCheck(org, id);
  let report: ShortfallReport;
  try {
    report = await investigateShortfall({
      provider: { slug: quote.providerSlug, name: quote.providerName, domain: await providerDomain(quote.providerSlug, quote.sourceUrl) },
      quote, quoteAmount: lead.quoteAmount!, allocated: settled.reduce((sum, receipt) => sum + Number(receipt.sourceAmount), 0),
      invoiceCurrency: invoice.currency, settlementCurrency: invoice.settlementCurrency, clientCountry: invoice.clientCountry, accountCountry: invoice.accountCountry,
      purpose: invoice.purpose, paymentMethod: check?.paymentMethod ?? "local_bank", settlement: view.combined,
    });
  } catch (error) {
    if (/GEMINI_API_KEY|Vertex/i.test((error as Error).message)) throw new InvoiceError("Investigating isn't set up on this server yet.", 503);
    throw new InvoiceError("Couldn't check the provider's pages just now. Try again in a minute.", 502);
  }
  const db = await getDb();
  await db.insert(freelancerSettlementAnalyses).values({ organizationId: org, invoiceId: id, receiptKey: receiptKey(view.receipts), report: report as unknown as Record<string, unknown> })
    .onConflictDoUpdate({ target: [freelancerSettlementAnalyses.organizationId, freelancerSettlementAnalyses.invoiceId], set: { receiptKey: receiptKey(view.receipts), report: report as unknown as Record<string, unknown>, createdAt: new Date() } });
  return report;
}

/** The person confirms a charge the investigation found (or one they know about): it joins the credit's named charges. */
export async function addReceiptDeduction(org: string, id: string, receiptId: string, input: unknown) {
  const item = ReceiptDeduction.parse(input);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [receipt] = await tx.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), eq(freelancerReceipts.invoiceId, id), eq(freelancerReceipts.id, receiptId))).for("update");
    if (!receipt) throw new InvoiceError("Receipt not found on this invoice.", 404);
    try { moneyUnits(item.amount, receipt.settlementCurrency); } catch (error) { throw new InvoiceError((error as Error).message); }
    if (receipt.deductions.some((existing) => existing.label === item.label)) return;
    if (receipt.deductions.length >= 6) throw new InvoiceError("A credit can list up to six charges.");
    await tx.update(freelancerReceipts).set({ deductions: [...receipt.deductions, item] }).where(eq(freelancerReceipts.id, receipt.id));
  });
  return invoiceSettlement(org, id);
}
