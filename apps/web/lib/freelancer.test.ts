import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({ db: null as any, search: vi.fn(), price: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
vi.mock("@railor/core", async (original) => ({ ...await original<typeof import("@railor/core")>(), searchCorridors: state.search }));
vi.mock("./org", () => ({ getSatisfiedRequirements: async () => ["identity"] }));
vi.mock("./pricing", () => ({ runPriceCheck: state.price }));
const database = await import("@railor/database");
const service = await import("./freelancer");
const client = new PGlite();
let orgA: string; let orgB: string; let user: string;
const draft = { invoiceNumber: "INV-001", clientName: "Synthetic client", clientCountry: "US", accountCountry: "IN", currency: "USD", amount: "1000.10", settlementCurrency: "INR", dueDate: "2026-10-15" };
const receipt = (reference: string, sourceAmount = "250.10") => ({ reference, providerName: "Skydo", sourceAmount, sourceCurrency: "USD", settlementAmount: "21000", settlementCurrency: "INR", receivedDate: "2026-10-07", confirmed: true, requestId: randomUUID() });
beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  // Also run the pending additive migration before it enters the hosted journal.
  const exists = await client.query("select to_regclass('public.freelancer_invoices') as name");
  if (!(exists.rows[0] as { name: string | null }).name) for (const statement of fs.readFileSync(path.resolve("../../packages/database/drizzle/0024_freelancer_invoices.sql"), "utf8").split("--> statement-breakpoint")) await client.exec(statement);
  const orgs = await state.db.insert(database.organizations).values([{ name: "Fixture A", slug: "invoice-fixture-a" }, { name: "Fixture B", slug: "invoice-fixture-b" }]).returning(); orgA = orgs[0].id; orgB = orgs[1].id;
  [ { id: user } ] = await state.db.insert(database.users).values({ email: "synthetic-invoice@test.invalid" }).returning();
}, 30000);
afterAll(async () => { await client.close(); });
describe("workspace invoices and receipt allocation", () => {
  it("scopes invoices and exports to the authenticated workspace", async () => {
    const invoice = await service.saveInvoice(orgA, user, draft);
    expect(await service.listInvoices(orgB)).toEqual([]);
    await expect(service.findInvoice(orgB, invoice.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.invoiceCsv(orgB, invoice.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.recordInvoiceReceipt(orgB, user, invoice.id, receipt("OTHER-ORG"))).rejects.toMatchObject({ status: 404 });
    expect((await service.listInvoices(orgA))[0]).toMatchObject({ status: "awaiting_payment", outstanding: "1000.10" });
    await service.saveInvoice(orgB, user, draft); // Same number, different workspace is valid.
    await expect(service.saveInvoice(orgA, user, draft)).rejects.toThrow();
  });
  it("records partial and full payment once, with retry-safe decimal amounts", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "PARTIAL" });
    const first = receipt("PARTIAL-REF");
    const saved = await service.recordInvoiceReceipt(orgA, user, invoice.id, first);
    expect((await service.recordInvoiceReceipt(orgA, user, invoice.id, { ...first, sourceAmount: "250.1000" })).id).toBe(saved.id);
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, { ...first, sourceAmount: "250.11" })).rejects.toMatchObject({ status: 409 });
    expect((await service.listInvoices(orgA)).find((r) => r.id === invoice.id)).toMatchObject({ status: "partially_paid", outstanding: "750.00" });
    await service.recordInvoiceReceipt(orgA, user, invoice.id, receipt("FINAL-REF", "750"));
    expect((await service.listInvoices(orgA)).find((r) => r.id === invoice.id)).toMatchObject({ status: "recorded_paid", outstanding: "0.00" });
    expect(await service.invoiceCsv(orgA, invoice.id)).toContain("Recorded manually by user");
  });
  it("rejects wrong currency, excess allocation and duplicate bank references", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "BAD-RECEIPTS" });
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, { ...receipt("WRONG"), sourceCurrency: "INR" })).rejects.toThrow(/invoice currency/);
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, receipt("TOO-LARGE", "1000.11"))).rejects.toThrow(/exceeds/);
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, { ...receipt("WRONG-SETTLE"), settlementCurrency: "EUR" })).rejects.toThrow(/settlement currency/);
    await expect(service.recordInvoiceReceipt(orgA, user, invoice.id, receipt("PARTIAL-REF"))).rejects.toThrow();
    expect(await service.invoiceReceipts(orgA, invoice.id)).toEqual([]);
  });
  it("serializes concurrent allocations without marking an overpaid invoice", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "CONCURRENT", amount: "100" });
    const outcomes = await Promise.allSettled([service.recordInvoiceReceipt(orgA, user, invoice.id, receipt("CONCURRENT-A", "60")), service.recordInvoiceReceipt(orgA, user, invoice.id, receipt("CONCURRENT-B", "60"))]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await service.listInvoices(orgA)).find((r) => r.id === invoice.id)?.outstanding).toBe("40.00");
  });
  it("uses the actual collection engine and unpaid balance without claiming an unverified route", async () => {
    const invoice = await service.saveInvoice(orgA, user, { ...draft, invoiceNumber: "ROUTING", amount: "1000" });
    await service.recordInvoiceReceipt(orgA, user, invoice.id, receipt("ROUTE-PARTIAL", "250"));
    state.search.mockResolvedValue({ results: [] }); state.price.mockResolvedValue({ rows: [], reference: null, generatedAt: "2026-10-07", unavailable: [] });
    const result = await service.routeInvoice(orgA, invoice.id);
    expect(state.search).toHaveBeenCalledWith(expect.objectContaining({ product: "collection", customerType: "business", sourceCountry: "US", amount: 750, amountCurrency: "USD" }), expect.objectContaining({ organizationId: orgA, includeDemoProviders: false, recordTelemetry: false }));
    expect(state.price).toHaveBeenCalledWith(orgA, expect.objectContaining({ amount: 750, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services" } }));
    expect(result.recommendedSlug).toBeNull();
  });
  it("escapes spreadsheet formulas in client names and references", () => {
    expect(service.csvCell(' =HYPERLINK("http://untrusted")')).toBe('"\' =HYPERLINK(""http://untrusted"")"');
    expect(service.csvCell("Client, Inc")).toBe('"Client, Inc"');
  });
});
