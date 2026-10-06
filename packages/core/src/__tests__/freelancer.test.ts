import { describe, expect, it } from "vitest";
import { InvoiceDraft, ReceiptDraft, moneyUnits, reconcileInvoice, rankInvoicePrices } from "../freelancer.js";
import { parseInvoiceExtraction, validateInvoiceFile } from "../invoice-extraction.js";
import type { PriceRow } from "../pricing.js";
const invoice = { invoiceNumber: "INV-001", clientName: "Fixture client", clientCountry: "US", accountCountry: "IN", currency: "USD", amount: "1000.10", settlementCurrency: "INR" };
const row = (slug: string, patch: Partial<PriceRow> = {}): PriceRow => ({ providerSlug: slug, providerName: slug, basis: "published", recipientAmount: 90000, feeAmount: 25, feeCurrency: "USD", rate: 90, totalCostPct: 0.025, partial: false, delivery: null, observedAt: "2026-10-07", source: { label: "Fixture" }, notes: [], profileAssessment: { status: "documented", reasons: [], verification: [], fees: "", limits: "", corridors: "", settlement: [], documents: [], purpose: "", priceApplicable: true, sources: [], reviewedAt: "2026-10-07" }, ...patch });
describe("invoice validation and deterministic reconciliation", () => {
  it("handles exact decimal sums and the currency's own precision", () => {
    expect(moneyUnits("0.10", "USD") + moneyUnits("0.20", "USD")).toBe(30n);
    expect(moneyUnits("1500", "JPY")).toBe(1500n);
    expect(moneyUnits("1.125", "KWD")).toBe(1125n);
    expect(() => moneyUnits("1.01", "JPY")).toThrow();
    expect(() => moneyUnits("1.001", "USD")).toThrow();
  });
  it("rejects impossible dates, unknown country, negative totals and unsupported currencies", () => {
    expect(InvoiceDraft.safeParse(invoice).success).toBe(true);
    for (const patch of [{ dueDate: "2026-02-30" }, { clientCountry: "XX" }, { amount: "-5" }, { amount: "0" }, { currency: "ABC" }, { amount: "1.005" }]) expect(InvoiceDraft.safeParse({ ...invoice, ...patch }).success).toBe(false);
  });
  it("tracks partial and complete allocations without comparing a bank credit to an invoice total", () => {
    expect(reconcileInvoice({ amount: "0.30", currency: "USD" }, [{ sourceAmount: "0.10", sourceCurrency: "USD" }, { sourceAmount: "0.20", sourceCurrency: "USD" }])).toMatchObject({ status: "recorded_paid", outstanding: "0.00" });
    expect(reconcileInvoice(invoice, [{ sourceAmount: "250.10", sourceCurrency: "USD" }])).toMatchObject({ status: "partially_paid", outstanding: "750.00" });
    expect(() => reconcileInvoice(invoice, [{ sourceAmount: "1001", sourceCurrency: "USD" }])).toThrow(/exceeds/);
    expect(() => reconcileInvoice(invoice, [{ sourceAmount: "90000", sourceCurrency: "INR" }])).toThrow(/invoice currency/);
  });
  it("requires explicit receipt confirmation", () => {
    expect(ReceiptDraft.safeParse({ reference: "test", providerName: "Skydo", sourceAmount: "100", sourceCurrency: "USD", settlementAmount: "8500", settlementCurrency: "INR", receivedDate: "2026-10-07", confirmed: false, requestId: "ad9162cd-f7cd-443a-a7ef-cc903039aa84" }).success).toBe(false);
  });
});
describe("invoice route recommendations", () => {
  it("never recommends market prices, unknown routes or incomplete costs", () => {
    const routes = new Map([ ["known", { eligibility: "additional_requirements" as const, score: 80, reasons: [], outstandingRequirements: ["KYC"] }], ["unknown", { eligibility: "unknown" as const, score: 99, reasons: [], outstandingRequirements: [] }] ]);
    const ranked = rankInvoicePrices([row("market", { basis: "market_estimate", recipientAmount: 100000 }), row("unknown", { recipientAmount: 99000 }), row("partial", { partial: true, recipientAmount: 120000 }), row("known")], routes);
    expect(ranked.recommendedSlug).toBe("known");
    expect(ranked.candidates.map((r) => r.providerSlug)).not.toContain("market");
    expect(ranked.candidates.filter((r) => r.canRecommend).map((r) => r.providerSlug)).toEqual(["known"]);
    expect(rankInvoicePrices([row("unknown")], routes).recommendedSlug).toBeNull();
  });
});
describe("untrusted document extraction", () => {
  it("enforces size and actual file signatures", () => {
    expect(() => validateInvoiceFile(Buffer.from("%PDF-1.7\nfixture"), "application/pdf")).not.toThrow();
    expect(() => validateInvoiceFile(Buffer.from("<script>alert(1)</script>"), "application/pdf")).toThrow(/matching/);
    expect(() => validateInvoiceFile(new Uint8Array(4 * 1024 * 1024 + 1), "image/png")).toThrow(/4 MB/);
  });
  it("rejects refusals, invalid JSON and invented facts instead of saving them", () => {
    expect(() => parseInvoiceExtraction("invoice", { text: "{}", candidates: [{ finishReason: "SAFETY" }] })).toThrow();
    expect(() => parseInvoiceExtraction("invoice", { text: "not json" })).toThrow();
    expect(() => parseInvoiceExtraction("invoice", { text: JSON.stringify({ invoiceNumber: null, clientName: null, clientCountry: null, currency: "ABC", amount: null, dueDate: null, warnings: [] }) })).toThrow();
    expect(parseInvoiceExtraction("receipt", { text: JSON.stringify({ reference: "BANK-001", providerName: null, sourceAmount: null, sourceCurrency: null, settlementAmount: "8500", settlementCurrency: "INR", receivedDate: "2026-10-07", warnings: ["Original invoice allocation is not printed."] }) })).toMatchObject({ sourceAmount: null, settlementAmount: "8500" });
  });
});
