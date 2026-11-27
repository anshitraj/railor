import { describe, expect, it } from "vitest";
import { computeViewportMetrics } from "./mobile-viewport";

describe("computeViewportMetrics", () => {
  it("reports keyboard open with positive kbOffset on iOS Safari (layout height unchanged, visual height shrinks)", () => {
    const metrics = computeViewportMetrics({
      innerWidth: 390,
      innerHeight: 844,
      visualHeight: 508,
      visualOffsetTop: 0,
      baselineHeight: 844,
      editing: true,
    });
    expect(metrics.keyboardOpen).toBe(true);
    expect(metrics.vvh).toBe(508);
    expect(metrics.kbOffset).toBe(336);
  });

  it("reports keyboard open with zero kbOffset on Android Chrome interactive-widget=resizes-content (no double offset)", () => {
    const metrics = computeViewportMetrics({
      innerWidth: 412,
      innerHeight: 520,
      visualHeight: 520,
      visualOffsetTop: 0,
      baselineHeight: 860,
      editing: true,
    });
    expect(metrics.keyboardOpen).toBe(true);
    expect(metrics.vvh).toBe(520);
    expect(metrics.kbOffset).toBe(0);
  });

  it("does not trigger keyboardOpen when not editing or on desktop viewports", () => {
    expect(
      computeViewportMetrics({
        innerWidth: 390,
        innerHeight: 844,
        visualHeight: 720,
        visualOffsetTop: 0,
        baselineHeight: 844,
        editing: false,
      }).keyboardOpen,
    ).toBe(false);

    expect(
      computeViewportMetrics({
        innerWidth: 1280,
        innerHeight: 800,
        visualHeight: 500,
        visualOffsetTop: 0,
        baselineHeight: 800,
        editing: true,
      }).keyboardOpen,
    ).toBe(false);
  });
});
