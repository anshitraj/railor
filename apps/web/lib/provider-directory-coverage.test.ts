import { describe, expect, it } from "vitest";
import universe from "../../../RAILOR_PROVIDER_UNIVERSE.json";
import { enrichDirectoryProvider } from "./provider-directory-coverage";
import { discoveredTransferDirectory } from "./transfer-provider-discovery";
import { waysToSend } from "./ways-to-send";
import logoManifest from "./provider-logo-manifest.json";

describe("provider directory coverage enrichment", () => {
  it("maps every single provider in RAILOR_PROVIDER_UNIVERSE.json so none show Not yet mapped", () => {
    const empty = universe.providers.filter((p) => {
      const row = enrichDirectoryProvider({
        slug: p.slug, name: p.name, category: p.categories[0] ?? "Provider", description: "",
        products: [], assets: [], networks: [], countryCount: 0, currencyCount: 0,
        customerTypes: [], hasApi: false, hasSandbox: false, hasWebhooks: false,
        headquartersCountry: null, lastVerifiedAt: null,
      });
      return row.countryCount === 0 && !row.scopeLabel && p.countryCount === 0 && p.currencies.length === 0;
    });
    expect(empty.map((p) => p.slug)).toEqual([]);

    for (const slug of [
      "cowrie", "cross-river", "crossmint", "currencycloud", "dtcpay", "opendue",
      "eco", "episode-six", "ethena", "fuze", "guardarian", "highnote",
      "immersve", "koywe", "lirium", "mastercard-move", "mesh", "mobee", "monavate",
    ]) {
      const row = enrichDirectoryProvider({
        slug, name: slug, category: "Provider", description: "",
        products: [], assets: [], networks: [], countryCount: 0, currencyCount: 0,
        customerTypes: [], hasApi: false, hasSandbox: false, hasWebhooks: false,
        headquartersCountry: null, lastVerifiedAt: null,
      });
      expect(row.countryCount > 0 || Boolean(row.scopeLabel), slug).toBe(true);
      expect(row.currencyCount, slug).toBeGreaterThan(0);
    }
  });

  it("maps every provider in discoveredTransferDirectory with countries and currencies", () => {
    const rows = discoveredTransferDirectory();
    const unmapped = rows.filter((r) => r.countryCount === 0 && !r.scopeLabel);
    expect(unmapped.map((r) => r.slug)).toEqual([]);
  });

  it("excludes unconfirmed destination-only candidates from Ways to send and bundles Xe's logo", () => {
    expect((logoManifest as Record<string, string>).xe).toBe("xe.png");
    const groups = waysToSend({
      from: "USD",
      to: "EUR",
      rows: [],
      candidates: [
        { providerSlug: "atlantic-money", providerName: "Atlantic Money", websiteUrl: "https://atlantic.money", category: "Transfer", currencyMatch: "destination", lastVerified: "2026-11-26" },
        { providerSlug: "wise", providerName: "Wise", websiteUrl: "https://wise.com", category: "Transfer", currencyMatch: "both", lastVerified: "2026-11-26" },
      ],
    });
    const online = groups.find((g) => g.id === "online");
    expect(online?.providers.map((p) => p.slug)).toEqual(["wise"]);
  });
});
