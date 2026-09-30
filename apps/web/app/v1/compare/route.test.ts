/** Route-branching tests for POST /v1/compare — fully mocked, like the sibling decisions route test. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticate, mockLoadProviderBySlug, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { mockAuthenticate: vi.fn(), mockLoadProviderBySlug: vi.fn(), MockApiError };
});

vi.mock("../../../lib/api-auth", () => ({ ApiError: MockApiError, authenticate: mockAuthenticate, recordUsage: vi.fn() }));
vi.mock("@railor/core", () => ({ loadProviderBySlug: mockLoadProviderBySlug }));

const { POST } = await import("./route");

function provider(slug: string, destinations: string[], hasApi: boolean) {
  return {
    provider: { slug, name: slug.toUpperCase(), hasApi, hasSandbox: false, hasWebhooks: false, lastVerifiedAt: new Date("2026-09-01T00:00:00Z") },
    products: [{ product: "payout" }],
    requirements: [{ key: "company_registration", mandatory: true }],
    facets: destinations.map((d) => ({
      capability: { availability: "supported", entityCountry: "IN", destinationCountry: d, destinationCurrency: "AED", sourceAsset: "USDC", sourceNetwork: "base", customerType: "business" },
      evidence: { id: `ev-${slug}` },
    })),
  };
}

const post = (body: unknown) =>
  POST(new Request("http://localhost/v1/compare", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("POST /v1/compare", () => {
  beforeEach(() => {
    mockAuthenticate.mockReset().mockResolvedValue({ organizationId: "org", keyId: "key", mode: "test", requestId: "req_1" });
    mockLoadProviderBySlug.mockReset();
  });

  it("rejects fewer than two providers", async () => {
    const response = await post({ providers: ["only-one"] });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });

  it("404s naming every unknown provider", async () => {
    mockLoadProviderBySlug.mockImplementation(async (slug: string) => (slug === "a" ? provider("a", ["AE"], true) : null));
    const response = await post({ providers: ["a", "ghost"] });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toContain("ghost");
  });

  it("returns only differing dimensions when asked", async () => {
    mockLoadProviderBySlug.mockImplementation(async (slug: string) =>
      slug === "a" ? provider("a", ["AE"], true) : provider("b", ["AE", "GB"], false),
    );
    const body = await (await post({ providers: ["a", "b"], only_differences: true })).json();
    expect(body.object).toBe("comparison");
    expect(body.dimensions).toEqual(expect.arrayContaining(["destination_countries", "has_api"]));
    expect(body.dimensions).not.toContain("products");
    expect(body.providers[1].dimensions.destination_countries).toEqual(["AE", "GB"]);
  });

  it("propagates authentication failures", async () => {
    mockAuthenticate.mockRejectedValue(new MockApiError(401, "missing_api_key", "no key"));
    const response = await post({ providers: ["a", "b"] });
    expect(response.status).toBe(401);
  });
});
