import { describe, expect, it } from "vitest";
import { dedupeByUrl, normalizeUrl } from "../country-research/dedupe.js";

describe("normalizeUrl", () => {
  it("collapses a trailing slash", () => {
    expect(normalizeUrl("https://rbi.org.in/page/")).toBe(normalizeUrl("https://rbi.org.in/page"));
  });

  it("lowercases the host but leaves the path case alone", () => {
    expect(normalizeUrl("https://RBI.org.in/Page")).toBe("https://rbi.org.in/Page");
  });

  it("strips a fragment", () => {
    expect(normalizeUrl("https://rbi.org.in/page#section-2")).toBe(normalizeUrl("https://rbi.org.in/page"));
  });

  it("does not collapse http and https — a real scheme difference", () => {
    expect(normalizeUrl("http://rbi.org.in/page")).not.toBe(normalizeUrl("https://rbi.org.in/page"));
  });

  it("falls back to the trimmed raw string for an unparseable URL instead of throwing", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("dedupeByUrl", () => {
  it("removes an exact duplicate", () => {
    const items = [{ url: "https://rbi.org.in/x", n: 1 }, { url: "https://rbi.org.in/x", n: 2 }];
    expect(dedupeByUrl(items)).toEqual([{ url: "https://rbi.org.in/x", n: 1 }]);
  });

  it("removes a trailing-slash duplicate, keeping the first occurrence", () => {
    const items = [{ url: "https://rbi.org.in/x", n: 1 }, { url: "https://rbi.org.in/x/", n: 2 }];
    expect(dedupeByUrl(items)).toHaveLength(1);
    expect(dedupeByUrl(items)[0]!.n).toBe(1);
  });

  it("keeps distinct URLs distinct", () => {
    const items = [{ url: "https://rbi.org.in/a" }, { url: "https://rbi.org.in/b" }];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });
});
