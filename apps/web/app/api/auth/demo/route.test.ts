import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ provision: vi.fn() }));
vi.mock("../../../../lib/demo", () => ({ provisionDemoSession: mocks.provision }));
const { GET } = await import("./route");
const request = () => new Request("https://www.railor.xyz/api/auth/demo");

describe("demo login availability", () => {
  beforeEach(() => mocks.provision.mockReset().mockResolvedValue(undefined));
  afterEach(() => vi.unstubAllEnvs());

  it("returns production visitors to login without creating a shared session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.railor.xyz/login?error=demo_unavailable");
    expect(mocks.provision).not.toHaveBeenCalled();
  });

  it("opens the populated workspace in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://www.railor.xyz/app");
    expect(mocks.provision).toHaveBeenCalledOnce();
  });
});
