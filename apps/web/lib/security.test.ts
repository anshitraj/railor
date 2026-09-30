import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, paymentLink, safeReturnPath } from "./security";
import { effectivePlan, PLAN_LIMITS } from "./plans";
afterEach(() => vi.unstubAllEnvs());

describe("authentication return paths", () => {
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "/%2fevil.com", "/%5cevil.com", "/%00foo", "/\nevil.com", "/%", "javascript:alert(1)"])("rejects %s", (path) => expect(safeReturnPath(path)).toBe("/welcome"));
  it("retains a local search after sign-in", () => expect(safeReturnPath("/app?q=India%20to%20UAE#results")).toBe("/app?q=India%20to%20UAE#results"));
  it("requires the canonical production origin", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", "http://example.com");
    expect(() => appOrigin()).toThrow();
    vi.stubEnv("APP_ORIGIN", "https://example.com"); expect(appOrigin()).toBe("https://example.com");
  });
});
describe("hosted payment redirect", () => {
  it.each(["https://buy.stripe.com.evil.com/x", "http://buy.stripe.com/x", "https://evil.com@buy.stripe.com/x", "https://buy.stripe.com:8443/x"])("rejects %s", (url) => {
    vi.stubEnv("FOUNDING_PAYMENT_LINK", url); expect(() => paymentLink()).toThrow();
  });
  it("accepts a configured provider URL", () => { vi.stubEnv("FOUNDING_PAYMENT_LINK", "https://buy.stripe.com/test"); expect(paymentLink()).toBe("https://buy.stripe.com/test"); });
});
describe("entitlement expiry", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const active = { plan: "founding", status: "active", validFrom: new Date("2026-09-01"), validUntil: new Date("2026-10-01") };
  it("defaults unknown organizations to free", () => expect(effectivePlan(null, now)).toBe("free"));
  it("grants Founding only inside its validity window", () => {
    expect(effectivePlan(active, now)).toBe("founding");
    expect(effectivePlan({ ...active, validUntil: now }, now)).toBe("free");
    expect(effectivePlan({ ...active, validUntil: null }, now)).toBe("free");
    expect(effectivePlan({ ...active, validFrom: new Date("2027-01-01") }, now)).toBe("free");
    expect(effectivePlan({ ...active, status: "revoked" }, now)).toBe("free");
    expect(PLAN_LIMITS[effectivePlan(active, now)].apiRequests).toBe(10_000);
  });
});
