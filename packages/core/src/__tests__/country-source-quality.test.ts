import { describe, expect, it } from "vitest";
import { classifySourceAuthority, rankByAuthority } from "../country-research/source-quality.js";

describe("classifySourceAuthority", () => {
  it("recognizes a central bank domain as official_regulator, scoped to its own country", () => {
    expect(classifySourceAuthority("https://www.rbi.org.in/Scripts/x.aspx", "IN")).toBe("official_regulator");
    // RBI's domain shouldn't count as authoritative for a different country's research.
    expect(classifySourceAuthority("https://www.rbi.org.in/Scripts/x.aspx", "US")).not.toBe("official_regulator");
  });

  it("recognizes a generic .gov domain as government (distinct from a named financial regulator)", () => {
    expect(classifySourceAuthority("https://www.usa.gov/some-page")).toBe("government");
    // consumerfinance.gov is itself a named US financial regulator (CFPB) — the curated
    // regulator list, not the generic .gov fallback, is what should classify it.
    expect(classifySourceAuthority("https://www.consumerfinance.gov/rules", "US")).toBe("official_regulator");
  });

  it("recognizes a known international body as international_organization", () => {
    expect(classifySourceAuthority("https://www.imf.org/en/countries")).toBe("international_organization");
    expect(classifySourceAuthority("https://www.fatf-gafi.org/en/topics")).toBe("international_organization");
  });

  it("recognizes SWIFT as an official_network", () => {
    expect(classifySourceAuthority("https://www.swift.com/standards")).toBe("official_network");
  });

  it("never guesses upward for an unrecognized domain", () => {
    expect(classifySourceAuthority("https://some-random-fintech-blog.example/post")).toBe("unknown");
  });

  it("returns unknown for an unparseable URL rather than throwing", () => {
    expect(classifySourceAuthority("not a url")).toBe("unknown");
  });
});

describe("rankByAuthority", () => {
  it("orders official_regulator above government above unknown", () => {
    const items = [
      { url: "https://blog.example/post" },
      { url: "https://www.rbi.org.in/x" },
      { url: "https://www.consumerfinance.gov/x" },
    ];
    const ranked = rankByAuthority(items, (i) => classifySourceAuthority(i.url, "IN"));
    expect(ranked.map((i) => i.url)).toEqual([
      "https://www.rbi.org.in/x",
      "https://www.consumerfinance.gov/x",
      "https://blog.example/post",
    ]);
  });
});
