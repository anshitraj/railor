import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { freelancerInvoices, freelancerReceipts, getDb } from "@railor/database";
import { InvoiceDraft, ReceiptDraft, moneyUnits, reconcileInvoice, rankInvoicePrices, searchCorridors, type InvoiceRouteEvidence } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { getSatisfiedRequirements } from "./org";
import { runPriceCheck } from "./pricing";

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
export async function recordInvoiceReceipt(org: string, user: string, id: string, input: unknown) {
  const draft = ReceiptDraft.parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Serialize allocations for this invoice so concurrent receipts cannot overpay it.
    const [invoice] = await tx.select().from(freelancerInvoices).where(and(eq(freelancerInvoices.organizationId, org), eq(freelancerInvoices.id, id))).for("update");
    if (!invoice) throw new InvoiceError("Invoice not found in this workspace.", 404);
    const [previous] = await tx.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), eq(freelancerReceipts.requestId, draft.requestId)));
    if (previous) {
      if (previous.invoiceId !== id || previous.reference !== draft.reference || previous.providerName !== draft.providerName || previous.sourceCurrency !== draft.sourceCurrency || previous.settlementCurrency !== draft.settlementCurrency || previous.receivedDate !== draft.receivedDate || moneyUnits(previous.sourceAmount, previous.sourceCurrency) !== moneyUnits(draft.sourceAmount, draft.sourceCurrency) || moneyUnits(previous.settlementAmount, previous.settlementCurrency) !== moneyUnits(draft.settlementAmount, draft.settlementCurrency)) throw new InvoiceError("This retry ID already belongs to a different receipt.", 409);
      return previous;
    }
    if (draft.settlementCurrency !== invoice.settlementCurrency) throw new InvoiceError("The bank credit must use this invoice's settlement currency.");
    const receipts = await tx.select().from(freelancerReceipts).where(and(eq(freelancerReceipts.organizationId, org), eq(freelancerReceipts.invoiceId, id)));
    try { reconcileInvoice(invoice, [...receipts, draft]); }
    catch (error) { throw new InvoiceError((error as Error).message); }
    const [receipt] = await tx.insert(freelancerReceipts).values({ ...draft, organizationId: org, invoiceId: id, recordedBy: user }).returning();
    return receipt!;
  });
}

export async function routeInvoice(org: string, id: string) {
  const invoice = await findInvoice(org, id);
  const receipts = await invoiceReceipts(org, id);
  const balance = reconcileInvoice(invoice, receipts);
  if (balance.status === "recorded_paid") throw new InvoiceError("This invoice has already been recorded as paid.");
  const amount = Number(balance.outstanding);
  // A freelancer's service export is commercial collection, not a personal remittance.
  const query = CorridorQuery.parse({ entityCountry: invoice.accountCountry, customerType: "business", sourceCountry: invoice.clientCountry, sourceCurrency: invoice.currency, destinationCountry: invoice.accountCountry, destinationCurrency: invoice.settlementCurrency, product: "collection", endpointType: "bank_account", amount, amountCurrency: invoice.currency });
  const satisfiedRequirements = await getSatisfiedRequirements(org);
  const [routing, prices] = await Promise.all([
    searchCorridors(query, { organizationId: org, satisfiedRequirements, preset: "cheapest", recordTelemetry: false, includeDemoProviders: false }),
    runPriceCheck(org, { sourceCurrency: invoice.currency, destinationCurrency: invoice.settlementCurrency, destinationCountry: invoice.accountCountry, amount, includeMarket: false, context: { profile: invoice.profile, country: invoice.accountCountry, direction: "receive", purpose: invoice.purpose } }),
  ]);
  const evidence = new Map<string, InvoiceRouteEvidence>(routing.results.map((r) => [r.provider.slug, { eligibility: r.eligibility, score: r.score, outstandingRequirements: r.outstandingRequirements, reasons: r.reasons.map((reason) => reason.message) }]));
  const ranked = rankInvoicePrices(prices.rows, evidence);
  return {
    ...ranked, reference: prices.reference, generatedAt: prices.generatedAt, amount: balance.outstanding,
    currency: invoice.currency, settlementCurrency: invoice.settlementCurrency,
    routeOptions: routing.results.filter((r) => r.eligibility !== "unavailable").slice(0, 8).map((r) => ({ providerSlug: r.provider.slug, providerName: r.provider.name, ...evidence.get(r.provider.slug)!, settlement: r.facts.settlementSummary ?? null, sources: r.evidence.map((e) => ({ url: e.sourceUrl, title: e.sourceTitle })) })),
    unavailable: prices.unavailable,
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
  const receipts = await invoiceReceipts(org, id);
  const balance = reconcileInvoice(invoice, receipts);
  const rows: unknown[][] = [["Invoice", "Client", "Invoice currency", "Invoice amount", "Outstanding", "Status", "Receipt reference", "Provider", "Allocated amount", "Allocated currency", "Bank credit", "Bank currency", "Received date", "Confirmation"]];
  for (const receipt of receipts.length ? receipts : [null]) rows.push([invoice.invoiceNumber, invoice.clientName, invoice.currency, invoice.amount, balance.outstanding, balance.status, receipt?.reference, receipt?.providerName, receipt?.sourceAmount, receipt?.sourceCurrency, receipt?.settlementAmount, receipt?.settlementCurrency, receipt?.receivedDate, receipt ? "Recorded manually by user" : "Awaiting payment"]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
