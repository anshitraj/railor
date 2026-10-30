import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const mocks = vi.hoisted(() => ({ database: vi.fn(), insert: vi.fn(), values: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async original => ({ ...await original<typeof import("@railor/database")>(), getDb: mocks.database }));
const api = await import("./api-auth");
const context = { organizationId: "org-fixture", keyId: "key-fixture", mode: "test" as const, requestId: "req-fixture" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.database.mockResolvedValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ values: mocks.values }); mocks.values.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("API failure boundaries", () => {
  it("does not let unavailable usage storage fail an otherwise completed API operation", async () => {
    mocks.values.mockRejectedValue(new Error("private PostgreSQL connection details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(api.recordUsage(context, "/v1/providers", "GET", 200, 8)).resolves.toBeUndefined();
    expect(log.mock.calls.flat().join(" ")).not.toContain("private PostgreSQL");
  });
  it("does not access metrics storage for failed authentication", async () => {
    await api.recordUsage(null, "/v1/providers", "GET", 401, 2);
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("returns a safe 500 for internal failures, keeping diagnostics out of responses and logs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = api.normalizeApiError(new Error("private SQL statement and account data"), "req-fixture");
    expect(result).toMatchObject({ status: 500, code: "internal_error" });
    expect(JSON.stringify(result)).not.toContain("private SQL");
    expect(log.mock.calls.flat().join(" ")).not.toContain("account data");
  });
  it("preserves authentication and quota errors, while treating invalid input as 400", () => {
    expect(api.normalizeApiError(new api.ApiError(429, "quota_exceeded", "Monthly allowance reached"))).toEqual({ status: 429, code: "quota_exceeded", message: "Monthly allowance reached" });
    const invalid = z.object({ amount: z.number().positive() }).safeParse({ amount: -1 });
    expect(api.normalizeApiError(invalid.error)).toMatchObject({ status: 400, code: "invalid_request" });
    expect(api.normalizeApiError(new SyntaxError("private parser details"))).toEqual({ status: 400, code: "invalid_json", message: "Send a valid JSON object body." });
  });
});
