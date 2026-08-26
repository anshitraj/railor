/**
 * The one property the spec is most emphatic about: this route must never
 * run the (paid) research pipeline for anyone but an authenticated admin.
 * getSession, @railor/core's researchCountry, and @railor/database are all
 * mocked — no real session, DB, Tavily, or Gemini I/O in this test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockResearchCountry } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockResearchCountry: vi.fn(),
}));

vi.mock("../../../../../../lib/auth", () => ({ getSession: mockGetSession }));
// rate-limit.ts (and auth.ts) start with `import "server-only"`, which throws
// unconditionally outside a real Next.js server-component bundle — including
// under plain vitest. Mocking both modules keeps this a pure route-logic test.
vi.mock("../../../../../../lib/rate-limit", () => ({ checkBurstLimit: () => true }));

vi.mock("@railor/core", () => ({
  researchCountry: mockResearchCountry,
  isResearchableCountry: (code: string) => ["US", "IN", "GB", "SG", "AE"].includes(code),
  RESEARCHABLE_COUNTRIES: ["US", "IN", "GB", "SG", "AE"],
}));

vi.mock("@railor/database", () => ({
  getDb: vi.fn().mockResolvedValue({ insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }) }),
  auditLogs: {},
}));

const { POST } = await import("./route");

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/admin/countries/IN/refresh", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const params = Promise.resolve({ code: "IN" });

describe("POST /api/admin/countries/:code/refresh", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockResearchCountry.mockReset();
  });

  it("returns 401 with no session, and never calls researchCountry", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await POST(makeRequest(), { params });
    expect(response.status).toBe(401);
    expect(mockResearchCountry).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in non-admin, and never calls researchCountry", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", email: "x@example.com", isAdmin: false } });
    const response = await POST(makeRequest(), { params });
    expect(response.status).toBe(403);
    expect(mockResearchCountry).not.toHaveBeenCalled();
  });

  it("calls researchCountry with triggerType admin_refresh for an authenticated admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", email: "admin@example.com", isAdmin: true } });
    mockResearchCountry.mockResolvedValue({
      countryIso2: "IN",
      runId: "run1",
      status: "completed",
      queriesCount: 9,
      sourcesDiscovered: 10,
      sourcesUsed: 8,
    });

    const response = await POST(makeRequest(), { params });
    expect(response.status).toBe(200);
    expect(mockResearchCountry).toHaveBeenCalledWith("IN", expect.objectContaining({ triggerType: "admin_refresh" }));
  });

  it("rejects a country outside the researchable set with 400, before calling researchCountry", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", email: "admin@example.com", isAdmin: true } });
    const response = await POST(makeRequest(), { params: Promise.resolve({ code: "DE" }) });
    expect(response.status).toBe(400);
    expect(mockResearchCountry).not.toHaveBeenCalled();
  });
});
