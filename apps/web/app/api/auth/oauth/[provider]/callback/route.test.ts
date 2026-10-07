import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), remove: vi.fn(), exchange: vi.fn(), user: vi.fn(), start: vi.fn(), session: vi.fn(), create: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie, delete: mocks.remove }) }));
vi.mock("../../../../../../lib/auth", () => ({ findOrCreateUserByEmail: mocks.user, startSession: mocks.start, getSession: mocks.session }));
vi.mock("../../../../../../lib/org", () => ({ createOrganizationForUser: mocks.create }));
vi.mock("../../../../../../lib/oauth", () => ({ isOAuthProvider: (p: string) => p === "google", completeOAuthExchange: mocks.exchange }));
const { GET } = await import("./route");
const request = (state = "fixture") => new Request(`https://www.railor.xyz/api/auth/oauth/google/callback?code=fixture&state=${state}`);
const context = { params: Promise.resolve({ provider: "google" }) };
const destination = (path: string) => mocks.cookie.mockReturnValue({ value: `google|fixture|${Date.now()}|${encodeURIComponent(path)}` });

describe("Google onboarding redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://www.railor.xyz");
    destination("/app/prices");
    mocks.exchange.mockResolvedValue({ email: "fixture@test.invalid", name: "Fixture" });
    mocks.user.mockResolvedValue({ id: "fixture", email: "fixture@test.invalid" });
    mocks.session.mockResolvedValue({ organization: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("starts a new account at onboarding and preserves its destination", async () => {
    expect((await GET(request(), context)).headers.get("location")).toBe("https://www.railor.xyz/welcome?next=%2Fapp%2Fprices");
    expect(mocks.create).toHaveBeenCalledWith("fixture", "fixture@test.invalid");
  });
  it("does not restart setup for a completed account", async () => {
    destination("/welcome"); mocks.session.mockResolvedValue({ organization: { onboardingCompletedAt: new Date() } });
    expect((await GET(request(), context)).headers.get("location")).toBe("https://www.railor.xyz/app");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("lets a new member accept their invitation before workspace setup", async () => {
    destination("/invite/fixture");
    expect((await GET(request(), context)).headers.get("location")).toBe("https://www.railor.xyz/invite/fixture");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a mismatched state before exchanging or creating an account", async () => {
    expect((await GET(request("wrong"), context)).headers.get("location")).toBe("https://www.railor.xyz/login?error=oauth_state");
    expect(mocks.exchange).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  });
});
