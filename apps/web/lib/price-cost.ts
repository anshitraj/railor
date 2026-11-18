import type { PriceRow } from "@railor/core";

/**
 * What a route costs against a benchmark rate, in the destination currency and
 * in basis points (1 bp = 0.01 percentage points).
 *
 *   baseline = source amount × benchmark rate
 *   cost     = baseline − what arrives through the route
 *   bps      = cost ÷ baseline × 10,000
 *
 * e.g. a ₹100,000 baseline and ₹99,500 arriving is ₹500, 50 bps. Money is held
 * in integer minor units (and the rate in millionths) so no float rounding
 * creeps into the figure; a negative cost is valid and kept (the route paid
 * more than the benchmark). Rows with an unknown fee get no number — the gap is
 * returned instead, so nothing is ranked on a guess.
 */
export interface BenchmarkCost {
  kind: "cost";
  currency: string;
  baselineMinor: number;
  netMinor: number;
  costMinor: number;
  bps: number;
}
export interface BenchmarkGap { kind: "gap"; reason: string }

const MINOR = 100n;
const RATE_SCALE = 1_000_000n;

function toMinor(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

/** Round-half-away-from-zero integer division for bigint. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

export function benchmarkCost(
  row: Pick<PriceRow, "recipientAmount" | "partial" | "costComplete" | "missing">,
  amount: number,
  referenceRate: number | null | undefined,
  currency: string,
): BenchmarkCost | BenchmarkGap {
  if (!(amount > 0)) return { kind: "gap", reason: "Enter an amount above zero." };
  if (!referenceRate || !(referenceRate > 0)) return { kind: "gap", reason: "No benchmark rate for this pair right now." };
  if (row.recipientAmount === null) return { kind: "gap", reason: "The source doesn’t give enough to calculate what arrives." };
  if (!(row.costComplete ?? !row.partial) || row.missing?.length) return { kind: "gap", reason: row.missing?.[0] ?? "Some fees are unknown, so the all-in cost isn’t calculated." };
  const amountMinor = toMinor(amount);
  const rateMicros = BigInt(Math.round(referenceRate * Number(RATE_SCALE)));
  const baselineMinor = divRound(amountMinor * rateMicros, RATE_SCALE);
  if (baselineMinor === 0n) return { kind: "gap", reason: "The benchmark amount is too small to compare." };
  const netMinor = toMinor(row.recipientAmount);
  const costMinor = baselineMinor - netMinor;
  const bps = divRound(costMinor * 10_000n, baselineMinor);
  return { kind: "cost", currency, baselineMinor: Number(baselineMinor), netMinor: Number(netMinor), costMinor: Number(costMinor), bps: Number(bps) };
}

/** "₹500 · 50 bps" (or "₹120 better · −12 bps" when the route beats the benchmark). */
export function formatBenchmarkCost(cost: BenchmarkCost, unit: "bps" | "percent" = "bps"): string {
  const symbol = cost.currency === "INR" ? "₹" : "";
  const value = Math.abs(cost.costMinor) / Number(MINOR);
  const money = `${symbol}${value.toLocaleString("en-US", { minimumFractionDigits: value >= 100 ? 0 : 2, maximumFractionDigits: value >= 100 ? 0 : 2 })}${symbol ? "" : ` ${cost.currency}`}`;
  const rate = unit === "percent"
    ? (cost.bps / 10_000).toLocaleString("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : `${cost.bps} bps`;
  return cost.costMinor >= 0 ? `${money} · ${rate}` : `${money} better · ${rate}`;
}
