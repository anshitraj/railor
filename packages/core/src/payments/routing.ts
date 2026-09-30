import type { ConnectionEnvironment, PaymentMode } from "./types.js";

/**
 * Payment routing: which provider executes, and in what fallback order.
 *
 * Eligibility is a gate, never a weight — a provider the policy/eligibility
 * engine did not pass is excluded with its reason, however cheap it looks.
 * Among the rest, each dimension is scored 0..1 from real inputs only. A
 * dimension Railor has no data for drops out of that candidate's average
 * (and lowers its reported confidence) instead of being defaulted to a
 * fabricated midpoint.
 */
export type RoutingPreset = "balanced" | "cheapest" | "fastest" | "most_reliable";
export type RouteDimension = "health" | "reliability" | "cost" | "speed" | "limits" | "preference";
export type Weights = Record<RouteDimension, number>;

export const ROUTING_WEIGHTS: Record<RoutingPreset, Weights> = {
  balanced: { health: 25, reliability: 25, cost: 20, speed: 15, limits: 10, preference: 5 },
  cheapest: { health: 10, reliability: 15, cost: 55, speed: 5, limits: 10, preference: 5 },
  fastest: { health: 15, reliability: 15, cost: 5, speed: 50, limits: 10, preference: 5 },
  most_reliable: { health: 35, reliability: 45, cost: 5, speed: 5, limits: 5, preference: 5 },
};

export const ROUTING_PRESET_LABEL: Record<RoutingPreset, string> = {
  balanced: "Balanced",
  cheapest: "Cheapest",
  fastest: "Fastest",
  most_reliable: "Most reliable",
};

export type RouteExecutor =
  | { kind: "provider"; connectionId: string; environment: ConnectionEnvironment }
  | { kind: "railor_sandbox" };

export interface RouteCandidateInput {
  providerSlug: string;
  providerName: string;
  /** Passed the decision engine's eligibility + policy gate. */
  eligible: boolean;
  exclusionReason?: string;
  executor: RouteExecutor | null;
  executorNote?: string;
  quote: { feeBps: number | null; etaMinutes: number | null; recipientAmount: number | null; quoteType: string; expiresAt?: string } | null;
  quoteNote?: string;
  healthOkRatio: number | null;
  activeIncident: boolean;
  observedSuccessRate: number | null;
  observedAttempts: number;
  advertisedEtaMinutes: number | null;
  limitStatus: "within" | "above_max" | "below_min" | "unknown";
  preferenceRank: number | null;
  preferenceCount: number;
  blocked: boolean;
}

export interface DimensionScore {
  score: number | null;
  weight: number;
  detail: string;
}

export interface ScoredRouteCandidate {
  providerSlug: string;
  providerName: string;
  executor: RouteExecutor;
  executorNote?: string;
  score: number;
  confidence: number;
  dimensions: Record<RouteDimension, DimensionScore>;
  quote: RouteCandidateInput["quote"];
  quoteNote?: string;
}

export interface PaymentRoutePlan {
  version: 1;
  generatedAt: string;
  mode: PaymentMode;
  preset: RoutingPreset;
  weights: Weights;
  candidates: ScoredRouteCandidate[];
  excluded: Array<{ providerSlug: string; providerName: string; reason: string }>;
}

const MIN_RELIABILITY_SAMPLE = 3;

function relative(value: number, min: number, max: number): number {
  return max === min ? 1 : 1 - (value - min) / (max - min);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function scoreRoute(inputs: RouteCandidateInput[], options: { mode: PaymentMode; preset: RoutingPreset; now?: Date }): PaymentRoutePlan {
  const weights = ROUTING_WEIGHTS[options.preset];
  const excluded: PaymentRoutePlan["excluded"] = [];
  const viable: Array<RouteCandidateInput & { executor: RouteExecutor }> = [];

  for (const input of inputs) {
    const reason = !input.eligible
      ? input.exclusionReason ?? "Did not pass eligibility or policy."
      : input.blocked
        ? "Blocked in your routing settings."
        : input.limitStatus === "above_max"
          ? "Amount is above this provider's published maximum."
          : input.limitStatus === "below_min"
            ? "Amount is below this provider's published minimum."
            : !input.executor
              ? input.executorNote ?? "No executable connection."
              : null;
    if (reason) excluded.push({ providerSlug: input.providerSlug, providerName: input.providerName, reason });
    else viable.push(input as RouteCandidateInput & { executor: RouteExecutor });
  }

  const fees = viable.map((c) => c.quote?.feeBps).filter((v): v is number => typeof v === "number");
  const etas = viable.map((c) => c.quote?.etaMinutes ?? c.advertisedEtaMinutes).filter((v): v is number => typeof v === "number");
  const [minFee, maxFee] = [Math.min(...fees), Math.max(...fees)];
  const [minEta, maxEta] = [Math.min(...etas), Math.max(...etas)];

  const candidates: ScoredRouteCandidate[] = viable.map((c) => {
    const eta = c.quote?.etaMinutes ?? c.advertisedEtaMinutes;
    const dimensions: Record<RouteDimension, DimensionScore> = {
      health: c.activeIncident
        ? { score: 0, weight: weights.health, detail: "Active incident reported." }
        : c.healthOkRatio === null
          ? { score: null, weight: weights.health, detail: "No health observations yet." }
          : { score: c.healthOkRatio, weight: weights.health, detail: `${pct(c.healthOkRatio)} of recent health checks passed.` },
      reliability:
        c.observedSuccessRate === null || c.observedAttempts < MIN_RELIABILITY_SAMPLE
          ? { score: null, weight: weights.reliability, detail: `Only ${c.observedAttempts} settled payment(s) observed — not enough to score.` }
          : { score: c.observedSuccessRate, weight: weights.reliability, detail: `${pct(c.observedSuccessRate)} of ${c.observedAttempts} payments settled.` },
      cost:
        typeof c.quote?.feeBps === "number"
          ? { score: relative(c.quote.feeBps, minFee, maxFee), weight: weights.cost, detail: `Quoted fee ${(c.quote.feeBps / 100).toFixed(2)}% (${c.quote.quoteType}).` }
          : { score: null, weight: weights.cost, detail: c.quoteNote ?? "No complete fee quote." },
      speed:
        typeof eta === "number"
          ? { score: relative(eta, minEta, maxEta), weight: weights.speed, detail: `~${eta} min to settle (${c.quote?.etaMinutes != null ? "quoted" : "advertised"}).` }
          : { score: null, weight: weights.speed, detail: "No settlement time published or quoted." },
      limits:
        c.limitStatus === "within"
          ? { score: 1, weight: weights.limits, detail: "Amount is within published limits." }
          : { score: null, weight: weights.limits, detail: "No published limits for this route." },
      preference:
        c.preferenceCount === 0
          ? { score: null, weight: weights.preference, detail: "No preferred providers set." }
          : c.preferenceRank === null
            ? { score: 0, weight: weights.preference, detail: "Not in your preferred list." }
            : { score: 1 - c.preferenceRank / c.preferenceCount, weight: weights.preference, detail: `Preferred #${c.preferenceRank + 1}.` },
    };
    const known = Object.values(dimensions).filter((d) => d.score !== null);
    const knownWeight = known.reduce((sum, d) => sum + d.weight, 0);
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const score = knownWeight ? known.reduce((sum, d) => sum + d.weight * (d.score as number), 0) / knownWeight : 0;
    return {
      providerSlug: c.providerSlug,
      providerName: c.providerName,
      executor: c.executor,
      executorNote: c.executorNote,
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round((knownWeight / totalWeight) * 100) / 100,
      dimensions,
      quote: c.quote,
      quoteNote: c.quoteNote,
    };
  });

  candidates.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.providerName.localeCompare(b.providerName));

  return {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    mode: options.mode,
    preset: options.preset,
    weights,
    candidates,
    excluded,
  };
}
