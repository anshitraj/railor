import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), resolveProviderLogo: vi.fn(), resolveRemoteLogo: vi.fn() }));
vi.mock("@railor/core", () => ({
  KNOWN_PROVIDER_SITES: {},
  resolveProviderLogo: mocks.resolveProviderLogo,
  resolveRemoteLogo: mocks.resolveRemoteLogo,
}));
vi.mock("@railor/database", () => ({ getDb: mocks.getDb, providers: {} }));

import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/logos/[slug]", () => {
  it("finds official websites for both audit-only and discovery-only providers", async () => {
    vi.stubEnv("RAILOR_REMOTE_LOGOS", "on");
    mocks.resolveProviderLogo.mockResolvedValue({ contentType: "image/png", body: Buffer.from("test image") });

    for (const [slug, site] of [["1money", "https://www.1money.com"], ["remitbee", "https://www.remitbee.com"]] as const) {
      const response = await GET(new Request(`http://localhost/api/logos/${slug}`), { params: Promise.resolve({ slug }) });
      expect(response.headers.get("Content-Type")).toBe("image/png");
      expect(mocks.resolveProviderLogo).toHaveBeenLastCalledWith(slug, site);
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
