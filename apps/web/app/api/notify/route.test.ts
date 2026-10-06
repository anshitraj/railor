import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), values: vi.fn(), limit: vi.fn() }));
vi.mock("../../../lib/auth", () => ({ getSession: mocks.session, companyDomain: (email: string) => email.endsWith("@company.com") ? "company.com" : null }));
vi.mock("../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit, requestIdentity: () => "test" }));
vi.mock("@railor/database", () => ({ ensureMigrated: vi.fn(), featureInterest: {}, getDb: async () => ({ insert: () => ({ values: (value: unknown) => { mocks.values(value); return { onConflictDoNothing: async () => undefined }; } }) }) }));

const { POST } = await import("./route");
const request = (body: unknown) => new Request("http://localhost/api/notify", { method: "POST", body: JSON.stringify(body) });

describe("execution and provider-access waitlist", () => {
  beforeEach(() => {
    mocks.values.mockReset(); mocks.limit.mockReset().mockResolvedValue(true);
    mocks.session.mockReset().mockResolvedValue({ user: { id: "user-1", email: "owner@company.com" }, organization: { id: "org-1" } });
  });
  it("stores organization, work email, requested provider and feature without payment data", async () => {
    const response = await POST(request({ feature: "execution", providerRequested: "wise", email: "ops@company.com" }));
    expect(response.status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith({ feature: "execution", providerRequested: "wise", email: "ops@company.com", userId: "user-1", organizationId: "org-1" });
    expect(await response.json()).toEqual({ ok: true });
  });
  it("rejects requests without an organization or work email", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1", email: "owner@company.com" }, organization: null });
    expect((await POST(request({ feature: "provider_connection", providerRequested: "wise" }))).status).toBe(400);
    expect((await POST(request({ feature: "execution", providerRequested: "wise", email: "person@gmail.com" }))).status).toBe(400);
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
