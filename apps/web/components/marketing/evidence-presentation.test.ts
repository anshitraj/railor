import { describe, expect, it } from "vitest";
import { evidenceConfidence, evidenceSourceHref } from "./evidence-presentation";

describe("evidence folio presentation", () => {
  it("shows medium confidence as a qualified score, not a green verification", () => {
    expect(evidenceConfidence(0.72, "medium")).toEqual({ label: "72%", ratio: 0.72, tone: "warn" });
  });
  it.each(["verified", "high"] as const)("uses a positive tone for %s", (band) => {
    expect(evidenceConfidence(0.95, band).tone).toBe("good");
  });
  it("does not disguise outdated evidence as verified even with a high numeric score", () => {
    expect(evidenceConfidence(0.95, "potentially_outdated").tone).toBe("muted");
    expect(evidenceConfidence(0.5, "needs_review").tone).toBe("bad");
  });
  it("keeps the meter in range and does not invent an invalid score", () => {
    expect(evidenceConfidence(1.5, "verified")).toMatchObject({ label: "100%", ratio: 1 });
    expect(evidenceConfidence(Number.NaN, "medium")).toEqual({ label: "—", ratio: 0, tone: "muted" });
  });
  it("links directly to a valid evidence document", () => {
    expect(evidenceSourceHref("https://support.ramp.network/article")).toBe("https://support.ramp.network/article");
  });
  it.each([undefined, "javascript:alert(1)", "data:text/html,hello", "https://user:password@example.test", "not a URL"])("does not make unsafe or missing source %s clickable", (url) => {
    expect(evidenceSourceHref(url)).toBeNull();
  });
});
