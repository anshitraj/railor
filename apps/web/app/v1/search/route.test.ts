import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
  return { ApiError, auth: vi.fn(), active: vi.fn(), defaultActive: vi.fn(), policy: vi.fn(), preview: vi.fn(), parse: vi.fn(), usage: vi.fn() };
});
vi.mock("../../../lib/api-auth", () => ({ ApiError: mocks.ApiError, authenticate: mocks.auth, recordUsage: mocks.usage }));
vi.mock("@railor/core", () => ({ getActivePolicyVersion: mocks.active, getDefaultActivePolicy: mocks.defaultActive, getPolicy: mocks.policy, searchPreview: mocks.preview }));
vi.mock("../../../lib/decisions", () => ({ buildFetchQuote: () => vi.fn(), parsePaymentIntentBody: mocks.parse }));
vi.mock("../../../lib/platform-pricing", () => ({ platformQuoteProviders: () => [] }));

const { POST } = await import("./route");
const policyId = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) => new Request("http://localhost/v1/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /v1/search", () => {
  beforeEach(() => {
    for (const mock of [mocks.auth, mocks.active, mocks.defaultActive, mocks.policy, mocks.preview, mocks.parse, mocks.usage]) mock.mockReset();
    mocks.auth.mockResolvedValue({ organizationId: "org-A", requestId: "req-1" });
    mocks.parse.mockReturnValue({ success: true, data: { destinationCountry: "DE", amount: 50_000 } });
  });
  it("rejects malformed intent without evaluating or writing", async () => {
    mocks.parse.mockReturnValue({ success: false, error: { issues: [{ path: ["amount"], message: "Required" }] } });
    const response = await POST(request({ intent: { amount: -1 } }));
    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("resolves policy in the authenticated tenant and never persists a decision or executes", async () => {
    mocks.active.mockResolvedValue({ policy: { id: policyId }, version: { id: "v1", versionNumber: 1, rules: {} } });
    mocks.preview.mockResolvedValue({ object: "search_preview", candidates: [], executionState: "NOT_INITIATED" });
    const response = await POST(request({ intent: { destination_country: "DE", amount: 50_000 }, policy_id: policyId }));
    expect(response.status).toBe(200);
    expect(mocks.active).toHaveBeenCalledWith("org-A", policyId);
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect((await response.json()).executionState).toBe("NOT_INITIATED");
  });
  it("returns 404 for a foreign or nonexistent policy", async () => {
    mocks.active.mockResolvedValue(null); mocks.policy.mockResolvedValue(null);
    const response = await POST(request({ policy_id: policyId }));
    expect(response.status).toBe(404);
    expect(mocks.policy).toHaveBeenCalledWith("org-A", policyId);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("requires an active policy", async () => {
    mocks.defaultActive.mockResolvedValue(null);
    const response = await POST(request({ destination_country: "DE", amount: 50_000 }));
    expect(response.status).toBe(409);
  });
});
