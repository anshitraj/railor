import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adapter = vi.hoisted(() => ({ getQuote: vi.fn() }));
const limit = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@railor/core", () => ({ getAdapter: () => adapter }));
vi.mock("./rate-limit", () => ({ consumeLimit: limit }));
const { platformQuoteProviders, getPlatformQuoteCheck, getPlatformQuoteChecks, fetchPlatformReferenceQuote } = await import("./platform-pricing");
const request = { sourceAsset: "USD", destinationCurrency: "EUR", amount: 1000 };
const envKeys = ["AIRWALLEX_PLATFORM_ENVIRONMENT", "AIRWALLEX_PLATFORM_CLIENT_ID", "AIRWALLEX_PLATFORM_API_KEY", "AIRWALLEX_SANDBOX_CLIENT_ID", "AIRWALLEX_SANDBOX_API_KEY", "airwallex_sandbox_client_id", "airwallex_sandbox_scoped_api", "RAILOR_SHOW_SANDBOX_QUOTES", "XFLOW_PLATFORM_PUBLIC_QUOTES", "XFLOW_PLATFORM_ENVIRONMENT", "XFLOW_PLATFORM_API_KEY", "XFLOW_PLATFORM_ACCOUNT_ID", "DLOCAL_PLATFORM_PUBLIC_QUOTES", "DLOCAL_PLATFORM_ENVIRONMENT", "DLOCAL_PLATFORM_CLIENT_ID", "DLOCAL_PLATFORM_CLIENT_SECRET"];

describe("Railor-owned, server-only pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks(); limit.mockResolvedValue(true); envKeys.forEach(key => vi.stubEnv(key, "")); vi.stubEnv("NODE_ENV", "development");
    adapter.getQuote.mockImplementation(async (_credentials, r) => ({ ...r, providerSlug: "airwallex", providerQuoteId: "private-reference", recipientAmount: 880, exchangeRate: "0.88", costPartial: true, quoteType: "live", accountContext: "customer_connected", verificationType: "provider_reported", observedAt: new Date().toISOString(), quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("does not call a provider without complete configured credentials", async () => {
    expect(await getPlatformQuoteCheck(request)).toBeNull();
    vi.stubEnv("airwallex_sandbox_client_id", "test-client");
    expect(await getPlatformQuoteCheck(request)).toBeNull();
    expect(adapter.getQuote).not.toHaveBeenCalled();
  });
  it("accepts the existing sandbox aliases without creating a customer connection", async () => {
    vi.stubEnv("airwallex_sandbox_client_id", "test-client"); vi.stubEnv("airwallex_sandbox_scoped_api", "test-secret-1");
    const result = await getPlatformQuoteCheck(request);
    expect(result).toMatchObject({ environment: "sandbox", status: "quoted", quote: { accountContext: "railor_network", quoteType: "indicative", recipientAmount: 880 } });
    expect(JSON.stringify(result)).not.toMatch(/test-secret|test-client|private-reference/);
    expect(adapter.getQuote).toHaveBeenCalledWith(expect.objectContaining({ environment: "sandbox" }), request);
    expect(platformQuoteProviders()).toEqual([]);
    expect(await fetchPlatformReferenceQuote("airwallex", request)).toBeNull();
  });
  it("never exposes sandbox results on a production deployment by default", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("airwallex_sandbox_client_id", "test-client"); vi.stubEnv("airwallex_sandbox_scoped_api", "test-secret-2");
    expect(await getPlatformQuoteCheck(request)).toBeNull(); expect(adapter.getQuote).not.toHaveBeenCalled();
  });
  it("requires explicit production configuration and never substitutes a sandbox key", async () => {
    vi.stubEnv("AIRWALLEX_PLATFORM_ENVIRONMENT", "production"); vi.stubEnv("airwallex_sandbox_client_id", "test-client"); vi.stubEnv("airwallex_sandbox_scoped_api", "test-secret-3");
    expect(platformQuoteProviders()).toEqual([]); expect(await getPlatformQuoteCheck(request)).toBeNull();
    vi.stubEnv("AIRWALLEX_PLATFORM_CLIENT_ID", "production-client"); vi.stubEnv("AIRWALLEX_PLATFORM_API_KEY", "production-secret-3");
    expect(platformQuoteProviders()).toEqual(["airwallex"]);
    expect(await fetchPlatformReferenceQuote("airwallex", request)).toMatchObject({ accountContext: "railor_network", quoteType: "indicative", costPartial: true });
    expect(adapter.getQuote).toHaveBeenCalledWith(expect.objectContaining({ environment: "production", apiKey: "production-secret-3" }), request);
    expect(await fetchPlatformReferenceQuote("wise", request)).toBeNull();
  });
  it("shares in-flight quote requests and caches briefly without caching across credentials", async () => {
    vi.stubEnv("AIRWALLEX_SANDBOX_CLIENT_ID", "test-client"); vi.stubEnv("AIRWALLEX_SANDBOX_API_KEY", "test-secret-4");
    await Promise.all([getPlatformQuoteCheck(request), getPlatformQuoteCheck(request)]);
    expect(adapter.getQuote).toHaveBeenCalledTimes(1);
    vi.stubEnv("AIRWALLEX_SANDBOX_API_KEY", "test-secret-rotated");
    await getPlatformQuoteCheck(request); expect(adapter.getQuote).toHaveBeenCalledTimes(2);
  });
  it("sanitizes provider errors and rejects stale or mismatched responses", async () => {
    vi.stubEnv("airwallex_sandbox_client_id", "test-client"); vi.stubEnv("airwallex_sandbox_scoped_api", "test-secret-5");
    adapter.getQuote.mockRejectedValue(new Error("Authorization: test-secret-5"));
    expect(await getPlatformQuoteCheck(request)).toMatchObject({ status: "unavailable", quote: null });
    expect(JSON.stringify(await getPlatformQuoteCheck(request))).not.toContain("test-secret-5");
    vi.stubEnv("airwallex_sandbox_scoped_api", "test-secret-6");
    adapter.getQuote.mockResolvedValue({ ...request, providerSlug: "airwallex", recipientAmount: Infinity, observedAt: "2000-01-01", expiresAt: "2000-01-02" });
    expect(await getPlatformQuoteCheck(request)).toMatchObject({ status: "unavailable", quote: null });
  });
  it("enforces a shared provider-call budget, including anonymous server-rendered requests", async () => {
    vi.stubEnv("AIRWALLEX_SANDBOX_CLIENT_ID", "test-client"); vi.stubEnv("AIRWALLEX_SANDBOX_API_KEY", "budget-secret"); limit.mockResolvedValue(false);
    expect(await getPlatformQuoteCheck(request)).toMatchObject({ status: "unavailable", quote: null });
    expect(limit).toHaveBeenCalledWith("platform-fx", "airwallex:sandbox", 60, 60000);
    expect(adapter.getQuote).not.toHaveBeenCalled();
  });
  it("refuses invalid amounts before touching provider quotas or credentials", async () => {
    vi.stubEnv("AIRWALLEX_SANDBOX_CLIENT_ID", "test-client"); vi.stubEnv("AIRWALLEX_SANDBOX_API_KEY", "amount-secret");
    for (const amount of [NaN, Infinity, -1, 0, 10000001]) expect(await getPlatformQuoteCheck({ ...request, amount })).toMatchObject({ status: "unavailable" });
    expect(limit).not.toHaveBeenCalled(); expect(adapter.getQuote).not.toHaveBeenCalled();
  });
  it("requires explicit partner public-display opt-in and suppresses sandbox observations in production", async () => {
    const india = { ...request, destinationCurrency: "INR", destinationCountry: "IN" };
    vi.stubEnv("XFLOW_PLATFORM_ENVIRONMENT", "production"); vi.stubEnv("XFLOW_PLATFORM_API_KEY", "sk_live_example");
    expect(await getPlatformQuoteChecks(india)).toEqual([]);
    vi.stubEnv("XFLOW_PLATFORM_PUBLIC_QUOTES", "true"); vi.stubEnv("NODE_ENV", "production");
    adapter.getQuote.mockImplementation(async (_credentials, r) => ({ ...r, providerSlug: "xflow", recipientAmount: 8250, exchangeRate: "82.5", costPartial: true, costNote: "Indicative FX only.", observedAt: new Date().toISOString(), quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), providerQuoteId: "private-xflow-id" }));
    const checks = await getPlatformQuoteChecks(india);
    expect(checks).toMatchObject([{ providerSlug: "xflow", status: "quoted", quote: { accountContext: "railor_network", costNote: "Indicative FX only." } }]);
    expect(JSON.stringify(checks)).not.toContain("private-xflow-id");
    expect(JSON.stringify(checks)).not.toContain("sk_live_example");
    vi.stubEnv("XFLOW_PLATFORM_ENVIRONMENT", "sandbox");
    expect(await getPlatformQuoteChecks(india)).toEqual([]);
  });
  it("gates dLocal on an amount-specific USD destination-country route", async () => {
    vi.stubEnv("DLOCAL_PLATFORM_PUBLIC_QUOTES", "true"); vi.stubEnv("DLOCAL_PLATFORM_ENVIRONMENT", "production");
    vi.stubEnv("DLOCAL_PLATFORM_CLIENT_ID", "client"); vi.stubEnv("DLOCAL_PLATFORM_CLIENT_SECRET", "secret");
    expect(await getPlatformQuoteChecks(request)).toEqual([]);
    adapter.getQuote.mockImplementation(async (_credentials, r) => ({ ...r, providerSlug: "dlocal", recipientAmount: 8300, exchangeRate: "83", costPartial: true, observedAt: new Date().toISOString(), quotedAt: new Date().toISOString() }));
    const checks = await getPlatformQuoteChecks({ ...request, destinationCountry: "IN", destinationCurrency: "INR" });
    expect(checks).toMatchObject([{ providerSlug: "dlocal", status: "quoted", quote: { accountContext: "railor_network", recipientAmount: 8300 } }]);
    expect(JSON.stringify(checks)).not.toContain("secret");
  });
});
