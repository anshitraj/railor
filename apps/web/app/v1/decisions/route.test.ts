/**
 * Regression test for an HTTP-pass bug: a nonexistent policy_id and a
 * real-but-never-activated policy_id both used to return the same
 * misleading `409 policy_not_active`. Fixed to distinguish
 * `404 policy_not_found` (no such policy) from `409 policy_not_active`
 * (policy exists, has no active version) from `409 no_active_policy` (no
 * policy_id given, org has none active) — see decisions/route.ts.
 *
 * Fully mocked, like the sibling admin/countries route test — this is a
 * pure route-branching test, not an integration test against real data.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// api-auth.ts itself starts with `import "server-only"` - a real throw
// outside a Next.js server-component bundle, including under plain vitest
// (see the sibling admin/countries route test's own comment on this) - so
// it must be replaced entirely, not partially via importOriginal. ApiError
// is reimplemented to match the real class exactly, since the route does
// `error instanceof ApiError`.
const { mockAuthenticate, mockGetDefaultActivePolicy, mockGetActivePolicyVersion, mockGetPolicy, mockRunDecisionEngine, mockPersistDecision, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    mockAuthenticate: vi.fn(),
    mockGetDefaultActivePolicy: vi.fn(),
    mockGetActivePolicyVersion: vi.fn(),
    mockGetPolicy: vi.fn(),
    mockRunDecisionEngine: vi.fn(),
    mockPersistDecision: vi.fn(),
    MockApiError,
  };
});
vi.mock("../../../lib/api-auth", () => ({
  ApiError: MockApiError,
  authenticate: mockAuthenticate,
  recordUsage: vi.fn(),
}));

vi.mock("@railor/core", () => ({
  getDefaultActivePolicy: mockGetDefaultActivePolicy,
  getActivePolicyVersion: mockGetActivePolicyVersion,
  getPolicy: mockGetPolicy,
  runDecisionEngine: mockRunDecisionEngine,
  persistDecision: mockPersistDecision,
}));

vi.mock("../../../lib/decisions", () => ({
  buildFetchQuote: () => vi.fn(),
  parsePaymentIntentBody: () => ({ success: true, data: { destinationCountry: "AE", amount: 1000 } }),
  serializeDecisionById: vi.fn().mockResolvedValue({ object: "decision", id: "decision-1" }),
}));

const { POST } = await import("./route");

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request("http://localhost/v1/decisions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: "Bearer rail_test_x" },
  });

describe("POST /v1/decisions — policy resolution error states", () => {
  beforeEach(() => {
    mockAuthenticate.mockReset().mockResolvedValue({ organizationId: "org-1", keyId: "key-1", mode: "test", requestId: "req_1" });
    mockGetDefaultActivePolicy.mockReset();
    mockGetActivePolicyVersion.mockReset();
    mockGetPolicy.mockReset();
    mockRunDecisionEngine.mockReset();
    mockPersistDecision.mockReset();
  });

  it("returns 409 no_active_policy when no policy_id is given and the org has no active policy", async () => {
    mockGetDefaultActivePolicy.mockResolvedValue(null);
    const response = await POST(makeRequest({ destination_country: "AE", amount: 1000 }));
    const json = await response.json();
    expect(response.status).toBe(409);
    expect(json.error.code).toBe("no_active_policy");
    expect(mockRunDecisionEngine).not.toHaveBeenCalled();
  });

  it("returns 404 policy_not_found for a policy_id that does not exist for this organization", async () => {
    mockGetActivePolicyVersion.mockResolvedValue(null);
    mockGetPolicy.mockResolvedValue(null); // the policy itself does not exist
    const response = await POST(makeRequest({ destination_country: "AE", amount: 1000, policy_id: "00000000-0000-0000-0000-000000000000" }));
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json.error.code).toBe("policy_not_found");
    expect(mockRunDecisionEngine).not.toHaveBeenCalled();
  });

  it("returns 409 policy_not_active for a real policy that has never been activated — distinct from policy_not_found", async () => {
    mockGetActivePolicyVersion.mockResolvedValue(null);
    mockGetPolicy.mockResolvedValue({ id: "policy-1", organizationId: "org-1", name: "Draft Only", status: "draft", activeVersionId: null }); // the policy DOES exist
    const response = await POST(makeRequest({ destination_country: "AE", amount: 1000, policy_id: "policy-1" }));
    const json = await response.json();
    expect(response.status).toBe(409);
    expect(json.error.code).toBe("policy_not_active");
    expect(mockRunDecisionEngine).not.toHaveBeenCalled();
  });

  it("proceeds to the decision engine once an active policy version resolves", async () => {
    mockGetActivePolicyVersion.mockResolvedValue({
      policy: { id: "policy-1" },
      version: { id: "version-1", versionNumber: 1, rules: {} },
    });
    mockRunDecisionEngine.mockResolvedValue({ status: "allow" });
    mockPersistDecision.mockResolvedValue({ id: "decision-1" });

    const response = await POST(makeRequest({ destination_country: "AE", amount: 1000, policy_id: "policy-1" }));
    expect(response.status).toBe(200);
    expect(mockRunDecisionEngine).toHaveBeenCalled();
  });
});
