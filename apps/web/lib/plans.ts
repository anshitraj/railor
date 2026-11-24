/**
 * What each plan includes. Price checks are free on every plan, signed in or
 * not; plans add saved state, alerts, monitoring and API volume.
 *
 * "founding" is the original $29 plan. It keeps working and gets Business
 * limits, so nobody who paid early loses anything.
 */
export const PLAN_LIMITS = {
  free: { savedCorridors: 3, savedPairs: 12, rateAlerts: 1, monitors: 1, apiRequests: 500, emailAlerts: false, comparisonExports: false, providerConnections: false },
  plus: { savedCorridors: 5, savedPairs: 25, rateAlerts: 10, monitors: 3, apiRequests: 1_000, emailAlerts: true, comparisonExports: false, providerConnections: false },
  pro: { savedCorridors: 25, savedPairs: 50, rateAlerts: 25, monitors: 10, apiRequests: 10_000, emailAlerts: true, comparisonExports: true, providerConnections: true },
  business: { savedCorridors: 50, savedPairs: 200, rateAlerts: 100, monitors: 25, apiRequests: 100_000, emailAlerts: true, comparisonExports: true, providerConnections: true },
  founding: { savedCorridors: 50, savedPairs: 200, rateAlerts: 100, monitors: 25, apiRequests: 100_000, emailAlerts: true, comparisonExports: true, providerConnections: true },
} as const;
export type Plan = keyof typeof PLAN_LIMITS;
export type PaidPlan = Exclude<Plan, "free" | "founding">;

export const PAID_PLANS: PaidPlan[] = ["plus", "pro", "business"];

/** Public price and name of each self-serve plan, in US dollars a month. */
export const PLAN_PRICES: Record<PaidPlan, { name: string; monthlyUsd: number }> = {
  plus: { name: "Plus", monthlyUsd: 2.99 },
  pro: { name: "Pro", monthlyUsd: 9.99 },
  business: { name: "Business", monthlyUsd: 29 },
};

export function planName(plan: Plan): string {
  return plan === "free" ? "Free" : plan === "founding" ? "Founding" : PLAN_PRICES[plan].name;
}

/** The cheapest plan that raises a limit above what this plan has, for upgrade prompts. */
export function nextPlanFor(plan: Plan, limit: "rateAlerts" | "savedPairs" | "monitors"): PaidPlan | null {
  return PAID_PLANS.find((candidate) => PLAN_LIMITS[candidate][limit] > PLAN_LIMITS[plan][limit]) ?? null;
}

export function effectivePlan(row: { plan: string; status: string; validFrom: Date; validUntil: Date | null } | null | undefined, now = new Date()): Plan {
  if (!row || row.plan === "free" || !(row.plan in PLAN_LIMITS)) return "free";
  return row.status === "active" && row.validFrom <= now && row.validUntil !== null && row.validUntil > now ? row.plan as Plan : "free";
}
