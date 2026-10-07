import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consume: vi.fn(), session: vi.fn(), createOrg: vi.fn() }));
vi.mock("../../../lib/auth", () => ({ consumeMagicLink: mocks.consume, getSession: mocks.session }));
vi.mock("../../../lib/org", () => ({ createOrganizationForUser: mocks.createOrg }));
const { GET } = await import("./route");
const request = (query = "?token=fixture") => new Request(`https://www.railor.xyz/auth/verify${query}`);

describe("email sign-in verification", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://www.railor.xyz");
    mocks.consume.mockResolvedValue({ user: { id: "user-1", email: "first@test.invalid" }, returnTo: "/welcome" });
    mocks.session.mockResolvedValue({ organization: null }); mocks.createOrg.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates a workspace for a first sign-in and continues to onboarding", async () => {
    expect((await GET(request())).headers.get("location")).toBe("https://www.railor.xyz/welcome");
    expect(mocks.createOrg).toHaveBeenCalledWith("user-1", "first@test.invalid");
  });

  it("does not create an extra workspace when signing in to accept an invitation", async () => {
    mocks.consume.mockResolvedValue({ user: { id: "user-1", email: "first@test.invalid" }, returnTo: "/invite/fixture" });
    expect((await GET(request())).headers.get("location")).toBe("https://www.railor.xyz/invite/fixture");
    expect(mocks.createOrg).not.toHaveBeenCalled();
  });

  it("returns expired or reused links to login", async () => {
    mocks.consume.mockResolvedValue(null);
    expect((await GET(request())).headers.get("location")).toBe("https://www.railor.xyz/login?error=expired");
    expect(mocks.createOrg).not.toHaveBeenCalled();
  });

  it("returns missing tokens to login without touching authentication", async () => {
    expect((await GET(request(""))).headers.get("location")).toBe("https://www.railor.xyz/login?error=missing_token");
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("takes a newly created account through onboarding before a requested app page", async () => {
    mocks.consume.mockResolvedValue({ user: { id: "user-1", email: "first@test.invalid" }, returnTo: "/app/prices" });
    expect((await GET(request())).headers.get("location")).toBe("https://www.railor.xyz/welcome?next=%2Fapp%2Fprices");
  });

  it("returns an already-onboarded account to its app", async () => {
    mocks.session.mockResolvedValue({ organization: { onboardingCompletedAt: new Date() } });
    expect((await GET(request())).headers.get("location")).toBe("https://www.railor.xyz/app");
    expect(mocks.createOrg).not.toHaveBeenCalled();
  });
});
