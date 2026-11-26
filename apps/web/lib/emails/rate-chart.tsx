import { ImageResponse } from "next/og";

export interface ChartPoint { date: string; rate: number }

const W = 1120;
const H = 440;
const PAD = { left: 104, right: 36, top: 36, bottom: 64 };
const ORANGE = "#c84420";

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const rateLabel = (value: number) => value.toLocaleString("en-US", { maximumSignificantDigits: 5 });

/** The geometry of the chart, kept apart from the drawing so it can be checked without rendering a picture. */
export function chartGeometry(points: ChartPoint[]) {
  const values = points.map((point) => point.rate);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = (high - low || high * 0.01) * 0.12;
  const min = low - margin;
  const max = high + margin;
  const x = (index: number) => PAD.left + (index / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.rate).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - PAD.bottom} L${x(0).toFixed(1)} ${H - PAD.bottom} Z`;
  const ticks = [0, 1, 2, 3].map((step) => min + ((max - min) * step) / 3);
  return { x, y, line, area, ticks, min, max };
}

/**
 * A 30-day line chart of the mid-market rate as a PNG, for the update email.
 * Drawn with the same renderer Next uses for share images, so it needs no
 * extra library. Returns null when there are too few points or drawing fails:
 * the email is then sent without a chart rather than not at all.
 */
export async function renderRateChart(points: ChartPoint[]): Promise<Buffer | null> {
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.rate))) return null;
  try {
    const { x, y, line, area, ticks } = chartGeometry(points);
    const last = points[points.length - 1]!;
    const middle = points[Math.floor(points.length / 2)]!;
    const response = new ImageResponse(
      (
        <div style={{ display: "flex", position: "relative", width: W, height: H, background: "#ffffff" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={ORANGE} stopOpacity="0.22" />
                <stop offset="1" stopColor={ORANGE} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => <line key={tick} x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#ece8df" strokeWidth="2" />)}
            <path d={area} fill="url(#fill)" />
            <path d={line} fill="none" stroke={ORANGE} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(points.length - 1)} cy={y(last.rate)} r="9" fill="#ffffff" stroke={ORANGE} strokeWidth="5" />
          </svg>
          {ticks.map((tick) => (
            <div key={tick} style={{ position: "absolute", left: 8, top: y(tick) - 13, width: PAD.left - 22, display: "flex", justifyContent: "flex-end", fontSize: 22, color: "#68635b" }}>{rateLabel(tick)}</div>
          ))}
          <div style={{ position: "absolute", left: PAD.left - 10, top: H - 42, display: "flex", fontSize: 22, color: "#68635b" }}>{dayLabel(points[0]!.date)}</div>
          <div style={{ position: "absolute", left: x(Math.floor(points.length / 2)) - 40, top: H - 42, display: "flex", fontSize: 22, color: "#68635b" }}>{dayLabel(middle.date)}</div>
          <div style={{ position: "absolute", right: PAD.right - 10, top: H - 42, display: "flex", fontSize: 22, color: "#68635b" }}>{dayLabel(last.date)}</div>
        </div>
      ),
      { width: W, height: H },
    );
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
