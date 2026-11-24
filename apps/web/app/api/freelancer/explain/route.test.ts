import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), investigate: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("../../../../lib/freelancer", () => ({ InvoiceError: class extends Error { constructor(message: string, public status = 400) { super(message); } }, investigateInvoice: mocks.investigate }));
const { POST } = await import("./route");
const ID = "5f1f1c0e-2f55-4c06-9d4f-0a6a2a3d2a11";
const request = (body: unknown, origin?: string) => new Request("http://localhost/api/freelancer/explain", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.limit.mockResolvedValue(true); mocks.investigate.mockResolvedValue({ status: "found" });
  mocks.session.mockResolvedValue({ user: { id: "USER" }, organization: { id: "OWN-ORG" }, role: "member" });
});
describe("explain route", () => {
  it("investigates for the session's workspace only", async () => {
    const response = await POST(request({ id: ID, organizationId: "FOREIGN" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ report: { status: "found" } });
    expect(mocks.investigate).toHaveBeenCalledWith("OWN-ORG", ID);
  });
  it("refuses viewers, anonymous visitors, other origins and bad ids", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "USER" }, organization: { id: "OWN-ORG" }, role: "viewer" });
    expect((await POST(request({ id: ID }))).status).toBe(403);
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request({ id: ID }))).status).toBe(401);
    expect((await POST(request({ id: ID }, "https://evil.test"))).status).toBe(403);
    expect((await POST(request({ id: "nope" }))).status).toBe(400);
    expect(mocks.investigate).not.toHaveBeenCalled();
  });
  it("limits how often a workspace can ask the model", async () => {
    mocks.limit.mockResolvedValueOnce(false);
    expect((await POST(request({ id: ID }))).status).toBe(429);
    expect(mocks.investigate).not.toHaveBeenCalled();
  });
});
