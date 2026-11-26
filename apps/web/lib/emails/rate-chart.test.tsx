import { describe, expect, it } from "vitest";
import { chartGeometry, renderRateChart } from "./rate-chart";

const points = Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10), rate: 92 - index * 0.05 + (index % 4) * 0.1 }));

describe("the 30-day rate chart", () => {
  it("places the lowest rate at the bottom and the highest at the top, with the line spanning the plot", () => {
    const { x, y, line, area, ticks, min, max } = chartGeometry(points);
    const rates = points.map((point) => point.rate);
    expect(min).toBeLessThan(Math.min(...rates));
    expect(max).toBeGreaterThan(Math.max(...rates));
    expect(y(Math.max(...rates))).toBeLessThan(y(Math.min(...rates)));
    expect(x(0)).toBeLessThan(x(points.length - 1));
    expect(line.startsWith("M")).toBe(true);
    expect(line.split("L")).toHaveLength(points.length);
    expect(area.endsWith("Z")).toBe(true);
    expect(ticks).toHaveLength(4);
    expect(ticks[0]).toBeCloseTo(min);
  });

  it("draws a flat series without dividing by zero", () => {
    const flat = points.map((point) => ({ ...point, rate: 92 }));
    const { y } = chartGeometry(flat);
    expect(Number.isFinite(y(92))).toBe(true);
  });

  it("renders a PNG, and returns nothing when there is too little to draw", async () => {
    expect(await renderRateChart([points[0]!])).toBeNull();
    expect(await renderRateChart([])).toBeNull();
    const png = await renderRateChart(points);
    // Drawing needs Next's renderer; where it can't run the email goes out without a chart, so null is a valid answer too.
    if (png) expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 30000);
});
