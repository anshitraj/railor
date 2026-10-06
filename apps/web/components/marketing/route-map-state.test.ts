import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeMapState, type RouteMapStats } from "./route-map-state";
import { LANDING_SIGNALS } from "./landing-data";

const empty: RouteMapStats = { checked: 90, supported: 0, partial: 0, topConfidence: null, evidenceCount: 0 };

describe("corridor diagram", () => {
  it("does not present an unchecked route as a match", () => {
    expect(routeMapState(null).tone).toBe("pending");
    expect(routeMapState({ ...empty, checked: 0 }).title).toBe("This route has not been evaluated");
  });
  it("preserves an honest coverage gap", () => {
    expect(routeMapState(empty)).toMatchObject({ tone: "muted", title: "No verified end-to-end route", description: "None of 90 indexed providers currently verify every leg." });
  });
  it("distinguishes conditional coverage from supported routes", () => {
    expect(routeMapState({ ...empty, partial: 2 })).toMatchObject({ tone: "warn", title: "2 routes need more KYB" });
    expect(routeMapState({ ...empty, supported: 1, partial: 2 })).toMatchObject({ tone: "good", title: "1 provider matches" });
  });
  it("evaluates the same network the hero diagram names", () => {
    expect(LANDING_SIGNALS[0]).toMatchObject({ sourceCode: "IN", sourceNetwork: "base", asset: "USDC", destinationCode: "AE", fiat: "AED" });
  });
  it.each(["networks/base.svg", "currencies/aed.svg"])("bundles safe vector artwork for %s", (file) => {
    const svg = readFileSync(join(process.cwd(), "public", "brand", file), "utf8");
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/<script|<foreignObject|\bon\w+\s*=|(?:xlink:)?href\s*=\s*["'](?:https?:|javascript:)/i);
  });
});
