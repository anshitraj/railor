import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), record: vi.fn(), route: vi.fn(), list: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("../../../lib/freelancer", () => ({ InvoiceError: class extends Error { constructor(message: string, public status = 400) { super(message); } }, saveInvoice: mocks.save, recordInvoiceReceipt: mocks.record, routeInvoice: mocks.route, listInvoices: mocks.list, findInvoice: vi.fn(), invoiceReceipts: vi.fn(), invoiceCsv: vi.fn() }));
const { POST, GET } = await import("./route");
const draft = { invoiceNumber: "INV-001", clientName: "Synthetic", clientCountry: "US", accountCountry: "IN", currency: "USD", amount: "1000", settlementCurrency: "INR" };
const request = (body: unknown, origin?: string) => new Request("http://localhost/api/freelancer", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.limit.mockResolvedValue(true); mocks.save.mockResolvedValue({ id: "saved" }); mocks.list.mockResolvedValue([]);
  mocks.session.mockResolvedValue({ user: { id: "USER" }, organization: { id: "OWN-ORG" }, role: "member" });
});
describe("freelancer API permissions", () => {
  it("takes organization and user from the session only", async () => {
    expect((await POST(request({ action: "save", draft, organizationId: "FOREIGN", userId: "OTHER" }))).status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith("OWN-ORG", "USER", expect.objectContaining(draft));
  });
  it("allows viewers to read but prevents changing invoices", async () => {
    mocks.session.mockResolvedValue({ user: { id: "USER" }, organization: { id: "OWN-ORG" }, role: "viewer" });
    expect((await GET(new Request("http://localhost/api/freelancer"))).status).toBe(200);
    expect((await POST(request({ action: "save", draft }))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects anonymous sessions, cross-origin mutations and rate limits", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost/api/freelancer"))).status).toBe(401);
    expect((await POST(request({ action: "save", draft }, "https://evil.test"))).status).toBe(403);
    mocks.limit.mockResolvedValueOnce(false);
    expect((await POST(request({ action: "save", draft }))).status).toBe(429);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("validates file-independent fields before writes", async () => {
    expect((await POST(request({ action: "save", draft: { ...draft, amount: "0" } }))).status).toBe(400);
    expect((await POST(request({ action: "route", id: "bad" }))).status).toBe(400);
    expect((await POST(request({ action: "save", draft, extra: "x".repeat(17000) }))).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
