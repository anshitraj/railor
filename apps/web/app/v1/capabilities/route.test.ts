/** Route tests for GET /v1/capabilities — query validation, normalization and the list envelope. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticate, mockListCapabilities } = vi.hoisted(() => ({ mockAuthenticate: vi.fn(), mockListCapabilities: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../../../lib/api-auth", async original => ({ ...await original<typeof import("../../../lib/api-auth")>(), authenticate: mockAuthenticate, recordUsage: vi.fn() }));
vi.mock("@railor/core", () => ({ listCapabilities: mockListCapabilities }));

const { GET } = await import("./route");
const get = (qs: string) => GET(new Request(`http://localhost/v1/capabilities${qs}`));

describe("GET /v1/capabilities", () => {
  beforeEach(() => {
    mockAuthenticate.mockReset().mockResolvedValue({ organizationId: "org", keyId: "key", mode: "test", requestId: "req_1" });
    mockListCapabilities.mockReset().mockResolvedValue({ rows: [], hasMore: false });
  });

  it("normalizes filters before querying", async () => {
    await get("?destination_country=ae&asset=usdc&network=BASE&provider=Acme&include_demo=true&limit=5");
    expect(mockListCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ destinationCountry: "AE", sourceAsset: "USDC", sourceNetwork: "base", provider: "acme", includeDemo: true, limit: 5 }),
    );
  });

  it("rejects malformed filters instead of ignoring them", async () => {
    const response = await get("?destination_country=UAE&starting_after=not-a-uuid");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("destination_country");
    expect(mockListCapabilities).not.toHaveBeenCalled();
  });

  it("does not expose storage diagnostics as a caller validation error", async () => {
    mockListCapabilities.mockRejectedValueOnce(new Error("private SQL and account details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await get(""); expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toMatchObject({ object: "error", request_id: "req_1", error: { code: "internal_error" } });
      expect(JSON.stringify(body)).not.toContain("private SQL");
    } finally { log.mockRestore(); }
  });

  it("returns a Stripe-shaped list with evidence on every row", async () => {
    mockListCapabilities.mockResolvedValue({
      hasMore: true,
      rows: [
        {
          capability: { id: "11111111-1111-4111-8111-111111111111", product: "payout", availability: "supported", lastVerifiedAt: new Date("2026-09-01T00:00:00Z"), derivation: "source" },
          providerSlug: "acme",
          providerName: "Acme",
          providerIsDemo: false,
          evidence: { confidence: "0.95", sourceType: "official_docs", sourceUrl: "https://acme.test/docs", sourceTitle: "Docs", lastVerifiedAt: new Date("2026-09-01T00:00:00Z") },
        },
      ],
    });
    const body = await (await get("")).json();
    expect(body).toMatchObject({ object: "list", has_more: true });
    expect(body.data[0]).toMatchObject({ object: "capability", provider: { id: "acme" }, confidence: 0.95, availability: "supported" });
    expect(body.data[0].evidence[0].url).toBe("https://acme.test/docs");
  });
});
