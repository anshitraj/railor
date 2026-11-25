import { describe, expect, it } from "vitest";
import { BACKBOARD, RIM, SCENE, START, ZONE, arcDots, cubic, flightKeyframes, missKeyframes, netPaths } from "./shot-path";

const translation = (transform: string) => {
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform)!;
  return { x: Number(match[1]), y: Number(match[2]) };
};

describe("the basketball shot", () => {
  it("runs a cubic from its first point to its last", () => {
    const p = [{ x: 0, y: 0 }, { x: 10, y: 40 }, { x: 30, y: 40 }, { x: 40, y: 0 }] as const;
    expect(cubic(0, ...p)).toEqual({ x: 0, y: 0 });
    expect(cubic(1, ...p)).toEqual({ x: 40, y: 0 });
  });

  it("starts with the paper where it rests and ends with it through the rim, faded out", () => {
    const frames = flightKeyframes();
    expect(frames[0]!.offset).toBe(0);
    expect(frames.at(-1)!.offset).toBeCloseTo(1, 10);
    expect(translation(frames[0]!.transform)).toEqual(START);
    expect(frames.at(-1)!.opacity).toBe(0);
    // It reaches the middle of the rim on the way down, not before.
    const atRim = frames.find((frame) => Math.abs(translation(frame.transform).x - RIM.cx) < 0.5 && Math.abs(translation(frame.transform).y - RIM.cy) < 0.5);
    expect(atRim).toBeDefined();
  });

  it("keeps time moving forward and the paper inside the scene until it drops out of sight", () => {
    for (const frames of [flightKeyframes(), missKeyframes()]) {
      for (let index = 1; index < frames.length; index += 1) expect(frames[index]!.offset).toBeGreaterThan(frames[index - 1]!.offset);
      for (const frame of frames.filter((item) => item.opacity === 1)) {
        const { x, y } = translation(frame.transform);
        expect(x).toBeGreaterThanOrEqual(-20);
        expect(x).toBeLessThanOrEqual(SCENE.width + 20);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThanOrEqual(SCENE.height);
      }
    }
  });

  it("makes a miss touch the rim's near edge and then fall away, not through it", () => {
    const frames = missKeyframes();
    const hit = frames.find((frame) => frame.offset >= 0.5)!;
    expect(translation(hit.transform).x).toBeLessThan(RIM.cx - RIM.rx + 4);
    expect(translation(frames.at(-1)!.transform).x).toBeLessThan(RIM.cx - RIM.rx);
    expect(frames.at(-1)!.opacity).toBe(0);
  });

  it("hints at the path with dots that stay between the paper and the rim", () => {
    const dots = arcDots(12);
    expect(dots).toHaveLength(12);
    for (const dot of dots) {
      expect(dot.y).toBeLessThan(START.y);
      expect(dot.y).toBeGreaterThan(BACKBOARD.y);
      expect(dot.x).toBeLessThan(RIM.cx);
    }
  });

  it("hangs the net below the rim and inside the drop zone", () => {
    const { mesh, rings } = netPaths();
    expect(rings).toHaveLength(3);
    const ys = [...mesh.matchAll(/ ([\d.]+)(?= L|$| M)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBeGreaterThan(RIM.cy);
    expect(Math.max(...ys)).toBeLessThan(ZONE.y + ZONE.height);
  });
});
