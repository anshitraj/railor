export const PLAN_LIMITS = {
  free: { savedCorridors: 3, monitors: 1, apiRequests: 500, emailAlerts: false, comparisonExports: false, providerConnections: false },
  founding: { savedCorridors: 50, monitors: 25, apiRequests: 10_000, emailAlerts: true, comparisonExports: true, providerConnections: true },
} as const;
export type Plan = keyof typeof PLAN_LIMITS;

export function effectivePlan(row: { plan: string; status: string; validFrom: Date; validUntil: Date | null } | null | undefined, now = new Date()): Plan {
  return row?.plan === "founding" && row.status === "active" && row.validFrom <= now &&
    row.validUntil !== null && row.validUntil > now ? "founding" : "free";
}
