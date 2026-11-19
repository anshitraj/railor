import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Google sign-in for personal and company accounts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each(["person@gmail.com", "person@company.example"])("accepts a verified email: %s", async email => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "private-access" }))
      .mockResolvedValueOnce(Response.json({ email, email_verified: true, name: "Test User" }));
    vi.stubGlobal("fetch", fetch);
    const { completeOAuthExchange } = await import("./oauth");
    expect(await completeOAuthExchange("google", "one-use-code", "https://www.railor.xyz/api/auth/oauth/google/callback"))
      .toEqual({ email, name: "Test User", avatarUrl: null });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(fetch.mock.calls[1]?.[0]).toBe("https://openidconnect.googleapis.com/v1/userinfo");
  });

  it("keeps the Google profile photo, and only from Google's image host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "a" }))
      .mockResolvedValueOnce(Response.json({ email: "p@gmail.com", email_verified: true, name: "P", picture: "https://lh3.googleusercontent.com/a/photo=s96-c" })));
    const { completeOAuthExchange, providerAvatar } = await import("./oauth");
    expect((await completeOAuthExchange("google", "c", "https://www.railor.xyz/cb")).avatarUrl).toBe("https://lh3.googleusercontent.com/a/photo=s96-c");
    expect(providerAvatar("https://evil.example/x.png", /(^|\.)googleusercontent\.com$/)).toBeNull();
    expect(providerAvatar("http://lh3.googleusercontent.com/x", /(^|\.)googleusercontent\.com$/)).toBeNull();
    expect(providerAvatar("javascript:alert(1)", /(^|\.)googleusercontent\.com$/)).toBeNull();
  });

  it("refuses an unverified email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "private-access" }))
      .mockResolvedValueOnce(Response.json({ email: "person@gmail.com", email_verified: false })));
    const { completeOAuthExchange } = await import("./oauth");
    await expect(completeOAuthExchange("google", "code", "https://www.railor.xyz/api/auth/oauth/google/callback"))
      .rejects.toThrow("no verified email");
  });

  it("requests identity scopes and preserves state without restricting account domains", async () => {
    const { buildAuthorizeUrl } = await import("./oauth");
    const url = new URL(buildAuthorizeUrl("google", "https://www.railor.xyz/api/auth/oauth/google/callback", "state-fixture"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-fixture");
    expect(url.searchParams.has("hd")).toBe(false);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
});
