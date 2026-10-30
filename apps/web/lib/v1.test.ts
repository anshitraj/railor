import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), usage: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./api-auth", async original => ({ ...await original<typeof import("./api-auth")>(), authenticate: mocks.authenticate, recordUsage: mocks.usage }));
const { v1Route } = await import("./v1");
const { ApiError } = await import("./api-auth");
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("API usage recording failures", () => {
  it("does not turn a successful request into a retryable failure when metrics fail", async () => {
    mocks.authenticate.mockResolvedValue({ organizationId: "org-fixture", requestId: "req-fixture" });
    mocks.usage.mockRejectedValue(new Error("private database diagnostics"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = v1Route("/v1/test", "POST", async () => ({ status: 201, body: { object: "result", id: "result-1" } }));
    const response = await handler(new Request("https://railor.test/v1/test"), { params: Promise.resolve({}) });
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ id: "result-1" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("private database diagnostics");
  });
  it("preserves validation status even if its usage entry cannot be recorded", async () => {
    mocks.authenticate.mockResolvedValue({ organizationId: "org-fixture", requestId: "req-fixture" });
    mocks.usage.mockRejectedValue(new Error("metrics unavailable")); vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = v1Route("/v1/test", "POST", async () => { throw new ApiError(400, "invalid_request", "Invalid input"); });
    const response = await handler(new Request("https://railor.test/v1/test"), { params: Promise.resolve({}) });
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });
});
