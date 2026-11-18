import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), extract: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("@railor/core", async (original) => ({ ...await original<typeof import("@railor/core")>(), extractPayslipDocument: mocks.extract }));
const { POST } = await import("./route");

function upload(consent = true, bytes = "%PDF-1.7\nSynthetic payslip only") {
  const form = new FormData(); form.set("file", new File([bytes], "synthetic-payslip.pdf", { type: "application/pdf" })); form.set("consent", String(consent));
  return new Request("http://localhost/api/payroll/extract", { method: "POST", body: form });
}
const member = { user: { id: "USER", email: "fixture@test.invalid" }, organization: { id: "ORG", building: "company" }, role: "member" };

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("GEMINI_API_KEY", "test-placeholder");
  mocks.limit.mockResolvedValue(true);
  mocks.extract.mockResolvedValue({ netPay: "142000", currency: "INR", country: "IN", warnings: [] });
  mocks.session.mockResolvedValue(member);
});
afterEach(() => vi.unstubAllEnvs());

describe("payslip import consent, privacy and limits", () => {
  it("never sends a payslip without consent or with a mismatched signature", async () => {
    expect((await POST(upload(false))).status).toBe(400);
    expect((await POST(upload(true, "<html>not a PDF</html>"))).status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("blocks the shared demo, viewers and workspaces without company tools", async () => {
    mocks.session.mockResolvedValueOnce({ ...member, user: { id: "DEMO", email: "demo@railor.dev" }, role: "owner" });
    expect((await POST(upload())).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ ...member, role: "viewer" });
    expect((await POST(upload())).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ ...member, organization: { id: "ORG", building: "freelancer" } });
    expect((await POST(upload())).status).toBe(403);
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(upload())).status).toBe(401);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("returns only the three figures, for review, and stores nothing", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ proposal: { netPay: "142000", currency: "INR", country: "IN", warnings: [] }, extraction: "gemini", requiresReview: true });
    expect(mocks.extract).toHaveBeenCalledWith(expect.any(Uint8Array), "application/pdf");
    expect(mocks.limit).toHaveBeenCalledWith("payslip-ai", "ORG", 30, 3_600_000);
  });

  it("keeps the sheet path usable when AI is unconfigured, limited or failing, without leaking details", async () => {
    vi.stubEnv("GEMINI_API_KEY", ""); expect((await POST(upload())).status).toBe(503);
    vi.stubEnv("GEMINI_API_KEY", "test-placeholder"); mocks.limit.mockResolvedValueOnce(false); expect((await POST(upload())).status).toBe(429);
    mocks.extract.mockRejectedValueOnce(new Error("net pay 142000 for a private person"));
    const response = await POST(upload());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private person");
  });
});
