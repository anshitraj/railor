import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

afterEach(() => vi.unstubAllEnvs());

const post = (url: string, headers: Record<string, string>) => middleware(new NextRequest(url, { method: "POST", headers }));

describe("cookie API origin check", () => {
  it("accepts a same-origin browser call even when APP_ORIGIN is missing or malformed", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", "");
    expect(post("https://www.example.com/api/search", { origin: "https://www.example.com" }).status).toBe(200);
    vi.stubEnv("APP_ORIGIN", "not a url");
    expect(post("https://www.example.com/api/search", { origin: "https://www.example.com" }).status).toBe(200);
  });
  it("accepts the address the browser used even when the server reports a different host name", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", "");
    expect(post("http://localhost:3211/api/search", { origin: "http://127.0.0.1:3211", host: "127.0.0.1:3211" }).status).toBe(200);
    expect(post("http://localhost:3211/api/search", { origin: "http://evil.example", host: "127.0.0.1:3211" }).status).toBe(403);
  });
  it("accepts the canonical origin when it differs from the request host", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", "https://www.example.com");
    expect(post("https://example.vercel.app/api/search", { origin: "https://www.example.com" }).status).toBe(200);
  });
  it("refuses another site, a missing origin, and an oversized body — with or without configuration", () => {
    for (const configured of ["", "https://www.example.com"]) {
      vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", configured);
      expect(post("https://www.example.com/api/search", { origin: "https://evil.example" }).status).toBe(403);
      expect(post("https://www.example.com/api/search", {}).status).toBe(403);
    }
    expect(post("https://www.example.com/api/search", { origin: "https://www.example.com", "content-length": "70000" }).status).toBe(413);
  });
  it("leaves bearer-authenticated and provider-signed routes alone", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", "");
    expect(post("https://www.example.com/v1/payments", {}).status).toBe(200);
    expect(post("https://www.example.com/api/webhooks/providers/bridge/abc", {}).status).toBe(200);
    expect(post("https://www.example.com/api/internal/payments-reconcile", {}).status).toBe(200);
  });
});
