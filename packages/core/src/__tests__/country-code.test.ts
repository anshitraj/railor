import { describe, expect, it } from "vitest";
import { isResearchableCountry, RESEARCHABLE_COUNTRIES } from "../country-research/config.js";

describe("isResearchableCountry", () => {
  it("accepts every seeded country, case-insensitively", () => {
    for (const code of RESEARCHABLE_COUNTRIES) {
      expect(isResearchableCountry(code)).toBe(true);
      expect(isResearchableCountry(code.toLowerCase())).toBe(true);
    }
  });

  it("rejects anything outside the seeded scope", () => {
    expect(isResearchableCountry("XX")).toBe(false);
    expect(isResearchableCountry("RU")).toBe(false); // a real country, just not in @railor/database's seeded countries table
    expect(isResearchableCountry("USA")).toBe(false); // ISO3, not ISO2
    expect(isResearchableCountry("")).toBe(false);
  });
});
