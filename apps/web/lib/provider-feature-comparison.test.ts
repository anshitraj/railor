import { describe, expect, it } from "vitest";
import { COMPARISON_PROVIDERS, PROVIDER_FEATURES, featureRows } from "./provider-feature-comparison";

describe("source-backed feature comparison", () => {
  it("covers every provider and binds each published claim to its own primary source", () => {
    const domains = { payzoll: "payzoll.finance", skydo: "skydo.com", airwallex: "airwallex.com" };
    for (const row of PROVIDER_FEATURES) for (const p of COMPARISON_PROVIDERS) {
      const cell = row.cells[p.slug];
      expect(cell.value).toBeTruthy();
      if (cell.status === "published") expect(new URL(cell.url!).hostname.replace(/^www\./, "")).toBe(domains[p.slug]);
      if (cell.status === "unknown") expect(cell.value).toBe("Not confirmed");
    }
  });
  it("does not turn a competitor's claims into Skydo unsupported features or mislabel countries as currencies", () => {
    expect(PROVIDER_FEATURES.find(r => r.key === "stablecoins")?.cells.skydo.status).toBe("unknown");
    expect(PROVIDER_FEATURES.find(r => r.key === "currency")?.cells.skydo.status).toBe("unknown");
    expect(PROVIDER_FEATURES.find(r => r.key === "fee")?.cells.skydo.detail).toContain("$2k");
    expect(PROVIDER_FEATURES.find(r => r.key === "fee")?.cells.payzoll.detail).toContain("partner");
  });
  it("uses a shared feature schema and a deterministic differences filter", () => {
    expect(new Set(PROVIDER_FEATURES.map(r => r.key)).size).toBe(PROVIDER_FEATURES.length);
    expect(featureRows(false)).toEqual(PROVIDER_FEATURES);
    expect(featureRows(true).every(row => new Set(Object.values(row.cells).map(cell => cell.value)).size > 1)).toBe(true);
  });
});
