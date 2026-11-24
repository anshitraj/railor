import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { randomUUID } from "node:crypto";

const state = vi.hoisted(() => ({ db: null as any, search: vi.fn(), price: vi.fn(), fx: vi.fn(), investigate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
vi.mock("@railor/core", async (original) => ({ ...await original<typeof import("@railor/core")>(), searchCorridors: state.search, investigateShortfall: state.investigate }));
vi.mock("./org", () => ({ getSatisfiedRequirements: async () => ["identity"] }));
vi.mock("./pricing", () => ({ runPriceCheck: state.price }));
vi.mock("./fx-history", () => ({ fxBetween: (...args: unknown[]) => state.fx(...args) }));
const database = await import("@railor/database");
const service = await import("./freelancer");
const client = new PGlite();
let orgA: string; let orgB: string; let user: string;
const draft = { invoiceNumber: "INV-001", clientName: "Synthetic client", clientCountry: "US", accountCountry: "IN", currency: "USD", amount: "1000", settlementCurrency: "INR", dueDate: "2026-10-15" };

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  const orgs = await state.db.insert(database.organizations).values([{ name: "Settle A", slug: "settle-a" }, { name: "Settle B", slug: "settle-b" }]).returning();
  orgA = orgs[0].id; orgB = orgs[1].id;
  [{ id: user }] = await state.db.insert(database.users).values({ email: "settlement@test.invalid" }).returning();
}, 30000);
afterAll(async () => { await client.close(); });

const row = (slug: string, name: string, recipientAmount: number, extra: Record<string, unknown> = {}) => ({
  providerSlug: slug, providerName: name, basis: "published", recipientAmount, feeAmount: 8.5, feeCurrency: "USD", rate: 92.3, totalCostPct: 0.5, partial: false, delivery: "1-2 days",
  observedAt: "2026-11-24T10:00:00Z", source: { label: name, url: `https://${slug}.example` }, notes: [], missing: [], product: { id: `${slug}:p`, label: `${name} · receive` },
  profileAssessment: { status: "documented", priceApplicable: true }, ...extra,
});
const quoted = (rows: Array<ReturnType<typeof row>>) => {
  state.search.mockResolvedValue({ results: rows.map((r) => ({ provider: { slug: r.providerSlug, name: r.providerName }, eligibility: "supported", score: 90, outstandingRequirements: [], reasons: [], facts: {}, evidence: [] })) });
  state.price.mockResolvedValue({ rows, reference: { rate: 93.44, source: "Wise" }, generatedAt: "2026-11-24T10:00:00Z", unavailable: [] });
};
const credit = (settlementAmount: string, extra: Record<string, unknown> = {}) => ({ settlementAmount, receivedDate: "2026-11-24", confirmed: true, requestId: randomUUID(), ...extra });

describe("quote saved against the invoice, then settled against the credit", () => {
  it("saves the recommended price as the quote and lets the user pick another", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "QUOTE-1", amount: "1700" });
    quoted([row("infinity", "Infinity", 156_952.26), row("skydo", "Skydo", 155_100)]);
    const routing = await service.routeInvoice(orgA, user, invoice.id);
    expect(routing).toMatchObject({ chosenSlug: "infinity", checkId: expect.any(String) });
    expect((await service.invoiceQuote(orgA, invoice.id))?.chosen).toMatchObject({ providerSlug: "infinity", expected: 156_952.26, product: "Infinity · receive" });
    const picked = await service.chooseQuote(orgA, invoice.id, routing.checkId!, "skydo");
    expect(picked.chosen?.providerSlug).toBe("skydo");
    await expect(service.chooseQuote(orgA, invoice.id, routing.checkId!, "wise")).rejects.toMatchObject({ status: 400 });
    await expect(service.chooseQuote(orgA, invoice.id, randomUUID(), "skydo")).rejects.toMatchObject({ status: 409 });
    await expect(service.chooseQuote(orgB, invoice.id, routing.checkId!, "skydo")).rejects.toMatchObject({ status: 404 });
  });

  it("starts from the top-ranked price when none is documented well enough to recommend", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "QUOTE-2", amount: "1000" });
    quoted([row("infinity", "Infinity", 92_000, { partial: true }), row("skydo", "Skydo", 91_000, { partial: true })]);
    const routing = await service.routeInvoice(orgA, user, invoice.id);
    expect(routing.recommendedSlug).toBeNull();
    expect(routing.chosenSlug).toBe("infinity");
  });

  it("needs only the credit and the date, and explains the gap by market move and named charges", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "SETTLE-1", amount: "1700" });
    quoted([row("infinity", "Infinity", 156_952.26)]);
    await service.routeInvoice(orgA, user, invoice.id);
    // The rate fell from 94.02 to 92.79 between the quote and the credit: about 1.31%.
    state.fx.mockResolvedValue({ source: "ECB", sourceUrl: "https://ecb.example", quoteDate: "2026-11-24", quoteRate: 94.02, receivedDate: "2026-11-24", receivedRate: 92.79 });
    const saved = await service.recordInvoiceReceipt(orgA, user, invoice.id, credit("154778", { deductions: [{ label: "Bank charge", amount: "118" }] }));
    expect(saved).toMatchObject({ providerName: "Infinity", sourceAmount: "1700.0000", sourceCurrency: "USD", settlementCurrency: "INR", quoteSlug: "infinity", reference: expect.stringMatching(/^RCPT-SETTLE-1-/) });
    const view = await service.invoiceSettlement(orgA, invoice.id);
    expect(view.receipts[0]?.settlement).toMatchObject({ expected: 156_952.26, credited: 154_778, fxChecked: true, deductionsTotal: 118 });
    expect(view.combined?.fxMove).toBeCloseTo(-2056, -1);
    expect(Math.abs(view.combined!.unexplained)).toBeLessThanOrEqual(view.combined!.tolerance);
    expect(view.combined?.verdict).toBe("explained");
    expect((await service.listInvoices(orgA)).find((r) => r.id === invoice.id)).toMatchObject({ status: "recorded_paid" });
    expect(await service.invoiceCsv(orgA, invoice.id)).toContain("Unexplained difference");
  });

  it("never blames the market when no reference rate could be fetched", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "SETTLE-2", amount: "1700" });
    quoted([row("infinity", "Infinity", 156_952.26)]);
    await service.routeInvoice(orgA, user, invoice.id);
    state.fx.mockResolvedValue(null);
    await service.recordInvoiceReceipt(orgA, user, invoice.id, credit("150000"));
    const { combined } = await service.invoiceSettlement(orgA, invoice.id);
    expect(combined).toMatchObject({ verdict: "short", fxChecked: false, fxMove: null });
    expect(combined?.unexplained).toBeCloseTo(-6952.26, 2);
  });

  it("matches the credit to the provider it came through and keeps the retry safe", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "SETTLE-3", amount: "1000" });
    quoted([row("infinity", "Infinity", 92_000), row("skydo", "Skydo", 91_000)]);
    await service.routeInvoice(orgA, user, invoice.id);
    state.fx.mockResolvedValue(null);
    const requestId = randomUUID();
    const body = credit("45500", { sourceAmount: "500", providerName: "Skydo", requestId });
    const first = await service.recordInvoiceReceipt(orgA, user, invoice.id, body);
    expect(first.quoteSlug).toBe("skydo");
    // The balance changed, but a retry of the same request is the same receipt.
    expect((await service.recordInvoiceReceipt(orgA, user, invoice.id, body)).id).toBe(first.id);
    expect((await service.recordInvoiceReceipt(orgA, user, invoice.id, credit("45500", { requestId }))).id).toBe(first.id);
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, credit("45501", { requestId }))).rejects.toMatchObject({ status: 409 });
    const { receipts } = await service.invoiceSettlement(orgA, invoice.id);
    expect(receipts[0]?.settlement?.expected).toBeCloseTo(45_500, 2);
    expect(receipts[0]?.settlement?.verdict).toBe("on_target");
  });

  it("refuses a credit once the invoice is fully covered, and keeps the check a receipt depends on", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "SETTLE-4", amount: "100" });
    quoted([row("infinity", "Infinity", 9_200)]);
    const first = await service.routeInvoice(orgA, user, invoice.id);
    state.fx.mockResolvedValue(null);
    await service.recordInvoiceReceipt(orgA, user, invoice.id, credit("9200"));
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, credit("10"))).rejects.toThrow(/fully covered/);
    const rows = await state.db.select().from(database.freelancerRouteChecks);
    expect(rows.some((item: { id: string }) => item.id === first.checkId)).toBe(true);
  });

  it("rejects charges the settlement currency cannot hold", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "SETTLE-5", amount: "100" });
    quoted([row("infinity", "Infinity", 9_200)]);
    await service.routeInvoice(orgA, user, invoice.id);
    state.fx.mockResolvedValue(null);
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, credit("9200", { deductions: [{ label: "Charge", amount: "1.234" }] }))).rejects.toMatchObject({ status: 400 });
  });

  it("keeps only the latest ten comparisons that no receipt depends on", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "PRUNE", amount: "100" });
    quoted([row("infinity", "Infinity", 9_200)]);
    for (let i = 0; i < 13; i += 1) await service.routeInvoice(orgA, user, invoice.id);
    const rows = await state.db.select().from(database.freelancerRouteChecks);
    expect(rows.filter((item: { invoiceId: string }) => item.invoiceId === invoice.id)).toHaveLength(10);
  });
});

const report = (overrides: Record<string, unknown> = {}) => ({ status: "found", model: "gemini-4-argon", shortfall: 2114.26, causes: [], explainable: 0, remaining: 2114.26, rate: null, searchQueries: [], pages: [], note: null, checkedAt: "2026-11-24T10:00:00Z", ...overrides });

describe("where did the missing money go", () => {
  async function shortInvoice(number: string, credited = "154000") {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: number, amount: "1700" });
    quoted([row("infinity", "Infinity", 156_952.26, { source: { label: "Infinity", url: "https://www.infinityapp.in/faqs" } })]);
    await service.routeInvoice(orgA, user, invoice.id);
    state.fx.mockResolvedValue(null);
    const saved = await service.recordInvoiceReceipt(orgA, user, invoice.id, credit(credited));
    return { invoice, saved };
  }

  it("asks Gemini only about a credit that is short, with amounts and country codes but no names", async () => {
    const { invoice } = await shortInvoice("WHY-1");
    state.investigate.mockResolvedValue(report());
    const result = await service.investigateInvoice(orgA, invoice.id);
    expect(result.status).toBe("found");
    const input = state.investigate.mock.calls.at(-1)![0];
    expect(input).toMatchObject({ provider: { slug: "infinity", name: "Infinity" }, quoteAmount: 1700, allocated: 1700, invoiceCurrency: "USD", settlementCurrency: "INR", clientCountry: "US", accountCountry: "IN", paymentMethod: "local_bank" });
    expect(JSON.stringify(input)).not.toContain("Synthetic client");
    expect(input.settlement.verdict).toBe("short");
    const view = await service.invoiceSettlement(orgA, invoice.id);
    expect(view.analysis).toMatchObject({ status: "found", model: "gemini-4-argon" });
  });

  it("refuses to investigate a credit that matches the quote, and hides a stale investigation after a new credit", async () => {
    const onTarget = await shortInvoice("WHY-2", "156900");
    await expect(service.investigateInvoice(orgA, onTarget.invoice.id)).rejects.toThrow(/Nothing is missing/);
    const { invoice } = await shortInvoice("WHY-3", "150000");
    state.investigate.mockResolvedValue(report());
    await service.investigateInvoice(orgA, invoice.id);
    expect((await service.invoiceSettlement(orgA, invoice.id)).analysis).not.toBeNull();
    // A second credit changes what the investigation was about.
    const partial = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "WHY-3B", amount: "1000" });
    quoted([row("infinity", "Infinity", 92_000)]);
    await service.routeInvoice(orgA, user, partial.id);
    await service.recordInvoiceReceipt(orgA, user, partial.id, credit("40000", { sourceAmount: "500" }));
    state.investigate.mockResolvedValue(report());
    await service.investigateInvoice(orgA, partial.id);
    expect((await service.invoiceSettlement(orgA, partial.id)).analysis).not.toBeNull();
    await service.recordInvoiceReceipt(orgA, user, partial.id, credit("40000", { sourceAmount: "400" }));
    expect((await service.invoiceSettlement(orgA, partial.id)).analysis).toBeNull();
  });

  it("explains a missing configuration or a model failure without leaking details", async () => {
    const { invoice } = await shortInvoice("WHY-4");
    state.investigate.mockRejectedValue(new Error("GEMINI_API_KEY is not set"));
    await expect(service.investigateInvoice(orgA, invoice.id)).rejects.toMatchObject({ status: 503 });
    state.investigate.mockRejectedValue(new Error("upstream blew up with secret details"));
    await expect(service.investigateInvoice(orgA, invoice.id)).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining("secret") });
  });

  it("counts a confirmed charge, once, and the credit becomes explained when it covers the gap", async () => {
    const { invoice, saved } = await shortInvoice("WHY-5", "155500");
    let view = await service.invoiceSettlement(orgA, invoice.id);
    expect(view.combined?.verdict).toBe("short");
    const missing = -view.combined!.unexplained;
    view = await service.addReceiptDeduction(orgA, invoice.id, saved.id, { label: "Intermediary bank deduction", amount: missing.toFixed(2) });
    expect(view.combined).toMatchObject({ verdict: "explained", deductionsTotal: Number(missing.toFixed(2)) });
    // Counting the same charge again changes nothing.
    view = await service.addReceiptDeduction(orgA, invoice.id, saved.id, { label: "Intermediary bank deduction", amount: missing.toFixed(2) });
    expect(view.receipts[0]?.deductions).toHaveLength(1);
  });

  it("rejects charges that don't belong or don't fit the currency", async () => {
    const { invoice, saved } = await shortInvoice("WHY-6");
    await expect(service.addReceiptDeduction(orgB, invoice.id, saved.id, { label: "x", amount: "1" })).rejects.toMatchObject({ status: 404 });
    await expect(service.addReceiptDeduction(orgA, invoice.id, randomUUID(), { label: "x", amount: "1" })).rejects.toMatchObject({ status: 404 });
    await expect(service.addReceiptDeduction(orgA, invoice.id, saved.id, { label: "x", amount: "1.234" })).rejects.toMatchObject({ status: 400 });
    await expect(service.addReceiptDeduction(orgA, invoice.id, saved.id, { label: "", amount: "1" })).rejects.toThrow();
    for (let i = 0; i < 6; i += 1) await service.addReceiptDeduction(orgA, invoice.id, saved.id, { label: `Charge ${i}`, amount: "1" });
    await expect(service.addReceiptDeduction(orgA, invoice.id, saved.id, { label: "Charge 7", amount: "1" })).rejects.toThrow(/up to six/);
  });
});
