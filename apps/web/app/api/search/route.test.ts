import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), session: vi.fn(), limit: vi.fn() }));
vi.mock("@railor/core", () => ({
  interpretRules: (input: string) => ({ input, query: { customerType: "business" }, tokens: [], missing: [], interpreter: "rules" }),
  searchCorridors: mocks.search,
}));
vi.mock("@railor/database", () => ({ ensureMigrated: async () => undefined }));
vi.mock("@railor/types", async () => {
  const { z } = await import("zod");
  return { CorridorQuery: z.object({ customerType: z.string().optional() }).passthrough(), RankingPreset: z.string() };
});
vi.mock("../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit, requestIdentity: () => "test" }));
vi.mock("../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../lib/org", () => ({ getSatisfiedRequirements: async () => undefined }));
vi.mock("../../../lib/market-discovery", () => ({ getCachedMarketDiscovery: async () => null }));

const { POST } = await import("./route");

const full = (slug: string, name: string) => ({
  provider: { slug, name, category: "Cross-border payments", isDemo: false },
  eligibility: "supported",
  confidence: 0.8,
  lastVerifiedAt: "2026-10-01T00:00:00Z",
  reasons: [{ code: "r", message: "Supports it", alsoTrue: [], wouldChange: [] }],
  facts: { productLabel: "Payouts", feeSummary: "0.5%", limitSummary: "10k" },
  evidence: [{ sourceUrl: "https://example.com", sourceTitle: "Docs", sourceType: "docs", retrievedAt: "x", lastVerifiedAt: "x", confidence: 0.9 }],
  receivingMode: "bank",
  routeConfirmation: "confirmed",
  confirmedDimensions: ["asset"],
  unconfirmedDimensions: [],
});
const searched = {
  providersChecked: 90,
  counts: { supported: 3, additional_requirements: 1, unavailable: 40, unknown: 46 },
  preset: "balanced",
  generatedAt: "2026-10-30T00:00:00Z",
  countryContext: null,
  results: [full("a", "Alpha"), full("b", "Beta"), full("c", "Gamma")],
};
const request = () =>
  new Request("http://localhost/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "USDC to EUR" }) });

describe("POST /api/search", () => {
  beforeEach(() => {
    for (const mock of [mocks.search, mocks.session, mocks.limit]) mock.mockReset();
    mocks.limit.mockResolvedValue(true);
    mocks.search.mockResolvedValue(searched);
  });

  it("gives a visitor who is not logged in two locked results and none of the answer", async () => {
    mocks.session.mockResolvedValue(null);
    const body = await (await POST(request())).json();
    expect(body.authenticated).toBe(false);
    expect(body.providersChecked).toBe(90);
    expect(body.results).toEqual([
      { provider: { slug: "a", name: "Alpha", category: "Cross-border payments", isDemo: false }, locked: true },
      { provider: { slug: "b", name: "Beta", category: "Cross-border payments", isDemo: false }, locked: true },
    ]);
    // No verdict, count, fee, limit or evidence is in the response at all.
    expect(body.counts).toBeNull();
    const text = JSON.stringify(body);
    for (const leaked of ["eligibility", "supported", "confidence", "feeSummary", "0.5%", "limitSummary", "evidence", "Supports it", "Gamma"]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("gives a logged-in visitor the whole answer", async () => {
    mocks.session.mockResolvedValue({ organization: { id: "org-1" } });
    const body = await (await POST(request())).json();
    expect(body.authenticated).toBe(true);
    expect(body.counts).toEqual(searched.counts);
    expect(body.results).toHaveLength(3);
    expect(body.results[0]).toMatchObject({ eligibility: "supported", facts: { feeSummary: "0.5%" } });
  });

  it("says nothing was found when nothing was, rather than locking nothing", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.search.mockResolvedValue({ ...searched, results: [] });
    const body = await (await POST(request())).json();
    expect(body.results).toEqual([]);
  });
});
