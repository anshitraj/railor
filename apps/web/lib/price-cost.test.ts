import { describe, expect, it } from "vitest";
import { benchmarkCost, benchmarkPayoutDifference, formatBenchmarkCost, formatPayoutDifference } from "./price-cost";

const complete = { partial: false, costComplete: true } as const;

describe("cost against a benchmark", () => {
  it("shows the quoted cost when account eligibility still needs confirmation", () => {
    expect(benchmarkCost({ partial: true, costComplete: true, recipientAmount: 902.70 }, 1000, .911702, "EUR"))
      .toMatchObject({ kind: "cost", costMinor: 900, bps: 99 });
  });

  it("matches the worked example: ₹100,000 baseline, ₹99,500 arrives → ₹500 and 50 bps", () => {
    const cost = benchmarkCost({ ...complete, recipientAmount: 99_500 }, 1_000, 100, "INR");
    expect(cost).toEqual({ kind: "cost", currency: "INR", baselineMinor: 10_000_000, netMinor: 9_950_000, costMinor: 50_000, bps: 50 });
    expect(cost.kind === "cost" && formatBenchmarkCost(cost)).toBe("₹500 · 50 bps");
    expect(cost.kind === "cost" && formatBenchmarkCost(cost, "percent")).toBe("₹500 · 0.50%");
  });

  it("uses exact minor units for a real-world pair", () => {
    // 1,700 USD at 93.4113 → ₹158,799.21 baseline; ₹157,973.41 arrives → ₹825.80, 52 bps.
    const cost = benchmarkCost({ ...complete, recipientAmount: 157_973.41 }, 1_700, 93.4113, "INR");
    expect(cost).toMatchObject({ kind: "cost", baselineMinor: 15_879_921, costMinor: 82_580, bps: 52 });
  });

  it("keeps a negative difference instead of treating it as an error", () => {
    const cost = benchmarkCost({ ...complete, recipientAmount: 100_120 }, 1_000, 100, "INR");
    expect(cost).toMatchObject({ kind: "cost", costMinor: -12_000, bps: -12 });
    expect(cost.kind === "cost" && formatBenchmarkCost(cost)).toBe("₹120 better · -12 bps");
  });

  it("returns the gap, not a number, when fees are incomplete or the benchmark is missing", () => {
    expect(benchmarkCost({ partial: true, costComplete: false, recipientAmount: 99_000, missing: ["Wire (SWIFT) fee not published"] }, 1_000, 100, "INR")).toEqual({ kind: "gap", reason: "Wire (SWIFT) fee not published" });
    expect(benchmarkCost({ ...complete, recipientAmount: 99_000 }, 1_000, null, "INR")).toMatchObject({ kind: "gap" });
    expect(benchmarkCost({ ...complete, recipientAmount: null }, 1_000, 100, "INR")).toMatchObject({ kind: "gap" });
  });

  it("compares the displayed payout even when all-in fees are unknown", () => {
    const expected = [
      [93_760, -41_250, "₹412.50 above mid-market"],
      [93_133, 21_450, "₹214.50 below mid-market"],
      [93_031, 31_650, "₹316.50 below mid-market"],
    ] as const;
    for (const [payout, minor, label] of expected) {
      const difference = benchmarkPayoutDifference(payout, 1_000, 93.3475, "INR");
      expect(difference).toMatchObject({ kind: "cost", costMinor: minor });
      expect(difference.kind === "cost" && formatPayoutDifference(difference)).toBe(label);
      expect(benchmarkCost({ partial: true, recipientAmount: payout }, 1_000, 93.3475, "INR").kind).toBe("gap");
    }
  });
});
