import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), usage: vi.fn(), prices: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/api-auth", async original => ({ ...await original<typeof import("../../../lib/api-auth")>(), authenticate: mocks.auth, recordUsage: mocks.usage }));
vi.mock("../../../lib/pricing", () => ({ runPriceCheck: mocks.prices }));
const { POST } = await import("./route");
const body = { source_currency: "usd", destination_currency: "inr", amount: 1000, include_market: true };
const context = { profile: "personal", country: "IN", direction: "receive", purpose: "personal" };
async function call(input: unknown) { return POST(new Request("https://railor.test/v1/prices", { method: "POST", body: JSON.stringify(input) }), { params: Promise.resolve({}) }); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ organizationId: "org-price-test", mode: "test", requestId: "req-price-test" });
  mocks.prices.mockImplementation(async (_org, input) => ({ input, reference: null, rows: [], unavailable: [], generatedAt: "2026-10-31T00:00:00Z" }));
});
describe("profile-aware pricing API", () => {
  it("passes the complete customer context to the same engine as the app", async () => {
    const response = await call({ ...body, context }); expect(response.status).toBe(200);
    expect(mocks.prices).toHaveBeenCalledWith("org-price-test", expect.objectContaining({ sourceCurrency: "USD", destinationCurrency: "INR", context }));
    expect(await response.json()).toMatchObject({ context, comparison_scope: "profile_specific" });
  });
  it("rejects a partial or unsupported profile before calling providers", async () => {
    for (const invalid of [{ profile: "personal" }, { ...context, profile: "individual" }, { ...context, direction: "payout" }]) expect((await call({ ...body, context: invalid })).status).toBe(400);
    expect(mocks.prices).not.toHaveBeenCalled();
  });
  it("returns validation errors for malformed currency and destination codes", async () => {
    for (const patch of [{ source_currency: "123" }, { destination_currency: "@@@" }, { destination_country: "12" }, { amount: 0 }]) expect((await call({ ...body, ...patch })).status).toBe(400);
    expect(mocks.prices).not.toHaveBeenCalled();
  });
  it("keeps legacy callers working but does not assign an unscoped best-price claim", async () => {
    mocks.prices.mockImplementation(async (_org, input) => ({ input, reference: null, rows: [{ providerSlug: "wise", basis: "live_public", partial: false, shortfall: 0, notes: [] }], unavailable: [], generatedAt: "2026-10-31T00:00:00Z" }));
    const response = await call(body); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ comparison_scope: "unscoped_reference", data: [{ comparable: false, shortfall_vs_best: null }], warnings: expect.arrayContaining([expect.any(String)]) });
  });
  it("preserves eligibility and conditional-source metadata for API and agent clients", async () => {
    mocks.prices.mockImplementation(async (_org, input) => ({ input, reference: null, rows: [{ providerSlug: "sample", basis: "market_estimate", partial: false, notes: [], publicComparison: { freshUntil: "2026-11-01T00:00:00Z", sourceCountry: "US" }, profileAssessment: { status: "unconfirmed", priceApplicable: true } }], unavailable: [], generatedAt: "2026-10-31T00:00:00Z" }));
    const response = await call({ ...body, context });
    expect(await response.json()).toMatchObject({ data: [{ comparable: false, profile_assessment: { status: "unconfirmed", price_applicable: true }, public_comparison: { fresh_until: "2026-11-01T00:00:00Z", source_country: "US" } }] });
  });
});
