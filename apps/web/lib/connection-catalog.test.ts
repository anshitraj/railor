import { describe, expect, it } from "vitest";
import publicProviders from "../../../PUBLIC_PRICING_PROVIDERS.json";
import { buildConnectionCatalog } from "./connection-catalog";
import { connectionProviderSlug, priceSourceTime, providerConnectionPath } from "./connection-navigation";

describe("public-pricing connection directory", () => {
  it("includes every surveyed provider without inventing credential records", () => {
    const rows = buildConnectionCatalog([]);
    expect(rows).toHaveLength(publicProviders.providers.length);
    for (const provider of publicProviders.providers) expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ slug: provider.slug, id: null })]));
    expect(rows.find((provider) => provider.slug === "revolut")?.name).toBe("Revolut");
  });

  it("preserves real provider IDs and deduplicates the feed while retaining regional branches", () => {
    const registered = { id: "wise-real-id", slug: "wise", name: "Wise", category: "Payout", description: "Registered Wise", docsUrl: "https://docs.wise.com" };
    const rows = buildConnectionCatalog([registered]);
    expect(rows.filter((provider) => provider.slug === "wise")).toEqual([registered]);
    expect(rows).toHaveLength(39);
    expect(rows.filter((provider) => provider.slug.startsWith("hsbc"))).toHaveLength(3);
  });

  it("routes estimate aliases to their own provider and preserves it through sign-in", () => {
    expect(connectionProviderSlug("market:instarem")).toBe("instarem");
    expect(providerConnectionPath("market:instarem")).toBe("/app/settings/connections?provider=instarem");
    const login = new URL(providerConnectionPath("market:bnp", "public"), "https://railor.dev");
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe("/app/settings/connections?provider=bnp");
  });

  it("encodes URL input as a query value instead of a redirect or path", () => {
    const url = new URL(providerConnectionPath("//other.test/a?x=1&next=evil"), "https://railor.dev");
    expect(url.pathname).toBe("/app/settings/connections");
    expect(url.origin).toBe("https://railor.dev");
    expect([...url.searchParams.keys()]).toEqual(["provider"]);
  });

  it("shows source collection time independently of a panel check", () => {
    expect(priceSourceTime("2026-10-06T12:31:20Z", "market_estimate")).toContain("06 Oct 2026, 12:31 UTC");
    expect(priceSourceTime("2026-10-07", "published")).toContain("Schedule reviewed");
    expect(priceSourceTime("invalid", "live_public")).toBe("Collection time unavailable");
  });
});
