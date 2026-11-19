import { describe, expect, it } from "vitest";
import { matchesRouteSearch } from "./global-route-map";
import { globeArc } from "./route-globe";

describe("globe route geometry", () => {
  it("keeps origin and destination order across the international date line", () => {
    const offset = Math.PI / 180;
    const from: [number, number, number] = [Math.sin(offset), 0, -Math.cos(offset)];
    const to: [number, number, number] = [-Math.sin(offset), 0, -Math.cos(offset)];
    const points = globeArc(from, to, 12);

    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(to);
    expect(points[6]![0]).toBeCloseTo(0);
    expect(points[6]![2]).toBeLessThan(-1);
  });
});

describe("route search", () => {
  it("respects the origin and destination when the query includes a direction", () => {
    expect(matchesRouteSearch("United States to India", "US United States", "IN India")).toBe(true);
    expect(matchesRouteSearch("United States to India", "IN India", "US United States")).toBe(false);
    expect(matchesRouteSearch("IN→US", "IN India", "US United States")).toBe(true);
    expect(matchesRouteSearch("India", "US United States", "IN India")).toBe(true);
  });
});
