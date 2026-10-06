import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), extract: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("@railor/core", async (original) => ({ ...await original<typeof import("@railor/core")>(), extractInvoiceDocument: mocks.extract }));
const { POST } = await import("./route");
function upload(consent = true, bytes = "%PDF-1.7\nSynthetic only") {
  const form = new FormData(); form.set("file", new File([bytes], "synthetic.pdf", { type: "application/pdf" })); form.set("kind", "invoice"); form.set("consent", String(consent));
  return new Request("http://localhost/api/freelancer/extract", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("GEMINI_API_KEY", "test-placeholder"); mocks.limit.mockResolvedValue(true); mocks.extract.mockResolvedValue({ invoiceNumber: "INV-001", warnings: [] });
  mocks.session.mockResolvedValue({ user: { id: "USER", email: "fixture@test.invalid" }, organization: { id: "ORG" }, role: "member" });
});
afterEach(() => vi.unstubAllEnvs());
describe("invoice upload consent and limits", () => {
  it("never sends documents without consent or with mismatched signatures", async () => {
    expect((await POST(upload(false))).status).toBe(400);
    expect((await POST(upload(true, "<html>not PDF</html>"))).status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("blocks viewers and private uploads in the shared demo", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "USER" }, organization: { id: "ORG" }, role: "viewer" });
    expect((await POST(upload())).status).toBe(403);
    mocks.session.mockResolvedValue({ user: { id: "DEMO", email: "demo@railor.dev" }, organization: { id: "ORG" }, role: "owner" });
    expect((await POST(upload())).status).toBe(403);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("returns review-only proposals, with no invoice creation", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requiresReview: true, extraction: "gemini", proposal: { invoiceNumber: "INV-001" } });
    expect(mocks.extract).toHaveBeenCalledWith(expect.any(Uint8Array), "application/pdf", "invoice");
  });
  it("keeps manual entry usable when AI is unconfigured, limited or unavailable", async () => {
    vi.stubEnv("GEMINI_API_KEY", ""); expect((await POST(upload())).status).toBe(503);
    vi.stubEnv("GEMINI_API_KEY", "test-placeholder"); mocks.limit.mockResolvedValueOnce(false); expect((await POST(upload())).status).toBe(429);
    mocks.extract.mockRejectedValueOnce(new Error("private vendor detail")); const response = await POST(upload());
    expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("private vendor detail");
  });
});
