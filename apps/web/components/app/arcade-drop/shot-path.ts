/**
 * The geometry of the basketball drop zone: where the paper starts, the arc it
 * flies and the net it falls through. Kept as plain numbers so the component
 * only has to draw it and the maths can be tested.
 *
 * Everything is in one coordinate system, a 360 × 380 scene.
 */

export interface Point { x: number; y: number }

export const SCENE = { width: 360, height: 380 } as const;
/** The dashed drop area: the hoop sits inside it, the paper waits just below it. */
export const ZONE = { x: 2, y: 2, width: 356, height: 312, radius: 22 } as const;
export const START: Point = { x: 46, y: 346 };
export const RIM = { cx: 180, cy: 218, rx: 56, ry: 10 } as const;
export const BACKBOARD = { x: 104, y: 106, width: 152, height: 92 } as const;

/** A shot rises along the left, peaks above the rim and drops into it. */
const MADE = { c1: { x: 40, y: 150 }, c2: { x: 120, y: 110 }, end: { x: RIM.cx, y: RIM.cy } } as const;
/** A miss is aimed at the near edge of the rim. */
const MISS = { c1: { x: 40, y: 150 }, c2: { x: 112, y: 120 }, end: { x: RIM.cx - RIM.rx - 2, y: RIM.cy - 8 } } as const;

export const FLIGHT_MS = 1150;
export const MISS_MS = 1250;
/** When the paper reaches the rim, as a share of the flight. */
export const REACH = 0.72;
export const NET_DELAY_MS = Math.round(FLIGHT_MS * REACH) - 40;
export const SETTLE_MS = 260;

export function cubic(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

const onArc = (arc: typeof MADE | typeof MISS, t: number) => cubic(t, START, arc.c1, arc.c2, arc.end);

/** Dots that hint at the shot's path, from just off the paper to just short of the rim. */
export function arcDots(count = 12): Point[] {
  return Array.from({ length: count }, (_, index) => onArc(MADE, 0.1 + (0.76 * index) / (count - 1)));
}

const pose = (point: Point, degrees: number, scale: number) => `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px) rotate(${degrees.toFixed(1)}deg) scale(${scale.toFixed(3)})`;

export type ShotFrame = Keyframe & { offset: number; transform: string; opacity: number };

/** Fades from 1 to exactly 0 over the last stretch of a fall, with no float residue at the end. */
const fadeOut = (t: number, from: number) => (t > from ? Math.max(0, Number((1 - (t - from) / (1 - from)).toFixed(4))) : 1);

const REST_TILT = -6;

/** The paper flying into the hoop, then dropping through the net and fading. */
export function flightKeyframes(steps = 30): ShotFrame[] {
  const frames: ShotFrame[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    frames.push({ offset: REACH * t, transform: pose(onArc(MADE, t), REST_TILT - 540 * t, 1 - 0.36 * t), opacity: 1 });
  }
  const drop = 8;
  for (let step = 1; step <= drop; step += 1) {
    const t = step / drop;
    frames.push({
      offset: REACH + (1 - REACH) * t,
      transform: pose({ x: RIM.cx + Math.sin(t * Math.PI) * 3, y: RIM.cy + 70 * t * t }, REST_TILT - 540 - 40 * t, 0.64 - 0.2 * t),
      opacity: fadeOut(t, 0.55),
    });
  }
  return frames;
}

/** The paper hitting the front of the rim and bouncing away. */
export function missKeyframes(steps = 26): ShotFrame[] {
  const frames: ShotFrame[] = [];
  const hit = 0.5;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    frames.push({ offset: hit * t, transform: pose(onArc(MISS, t), REST_TILT - 360 * t, 1 - 0.3 * t), opacity: 1 });
  }
  const from = MISS.end;
  const bounce = 14;
  for (let step = 1; step <= bounce; step += 1) {
    const t = step / bounce;
    frames.push({
      offset: hit + (1 - hit) * t,
      // Up and away off the rim, then down past the zone under gravity.
      transform: pose({ x: from.x - 70 * t, y: from.y - 46 * t + 190 * t * t }, REST_TILT - 360 - 280 * t, 0.7 - 0.12 * t),
      opacity: fadeOut(t, 0.6),
    });
  }
  return frames;
}

/** The net, as SVG path data: a diamond mesh plus a few sagging rings. */
export function netPaths(): { mesh: string; rings: string[] } {
  const top = RIM.cy + 4;
  const bottom = RIM.cy + 74;
  const strands = 9;
  const topX = (index: number) => RIM.cx - RIM.rx + 4 + (index * (2 * RIM.rx - 8)) / (strands - 1);
  const bottomX = (index: number) => RIM.cx + (topX(index) - RIM.cx) * 0.4;
  const lines: string[] = [`M${topX(0).toFixed(1)} ${top} L${bottomX(0).toFixed(1)} ${bottom}`, `M${topX(strands - 1).toFixed(1)} ${top} L${bottomX(strands - 1).toFixed(1)} ${bottom}`];
  for (let index = 0; index < strands - 1; index += 1) {
    lines.push(`M${topX(index).toFixed(1)} ${top} L${bottomX(index + 1).toFixed(1)} ${bottom}`);
    lines.push(`M${topX(index + 1).toFixed(1)} ${top} L${bottomX(index).toFixed(1)} ${bottom}`);
  }
  const rings = [0.28, 0.55, 0.82].map((share) => {
    const y = top + (bottom - top) * share;
    const half = (RIM.rx - 4) * (1 - 0.6 * share);
    return `M${(RIM.cx - half).toFixed(1)} ${y.toFixed(1)} Q${RIM.cx} ${(y + 7).toFixed(1)} ${(RIM.cx + half).toFixed(1)} ${y.toFixed(1)}`;
  });
  return { mesh: lines.join(" "), rings };
}

/** The net swinging as the paper drops through. */
export const NET_SWISH: Keyframe[] = [
  { transform: "scaleY(1) skewX(0deg)", offset: 0 },
  { transform: "scaleY(1.16) skewX(-4deg)", offset: 0.25 },
  { transform: "scaleY(0.94) skewX(3deg)", offset: 0.55 },
  { transform: "scaleY(1.04) skewX(-1.5deg)", offset: 0.8 },
  { transform: "scaleY(1) skewX(0deg)", offset: 1 },
];

/** The rim ringing when a shot hits it. */
export const RIM_CLANG: Keyframe[] = [
  { transform: "translateY(0)", offset: 0 },
  { transform: "translateY(3px)", offset: 0.2 },
  { transform: "translateY(-2px)", offset: 0.5 },
  { transform: "translateY(1px)", offset: 0.75 },
  { transform: "translateY(0)", offset: 1 },
];
