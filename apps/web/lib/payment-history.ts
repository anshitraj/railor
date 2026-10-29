import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, payments, providerConnections } from "@railor/database";

export const HISTORY_STATUSES = ["ready", "requires_approval", "submitting", "processing", "awaiting_funds", "unknown", "completed", "failed", "returned", "blocked", "cancelled"] as const;
export const HISTORY_STATUS_LABEL: Record<string, string> = {
  ready: "Ready", requires_approval: "Needs approval", submitting: "Submitting", processing: "Processing",
  awaiting_funds: "Awaiting funds", unknown: "Outcome unknown", completed: "Completed", failed: "Failed",
  returned: "Returned", blocked: "Blocked", cancelled: "Cancelled",
};

export interface PaymentHistorySummary {
  counts: Record<string, number>;
  total: number;
  completed: number;
  open: number;
  connectedProviders: number;
  successRate: number | null;
}

/** All-time filter counts; the completion/success cohort uses creation in the last 30 days. */
export async function getPaymentHistorySummary(organizationId: string, mode: "test" | "live"): Promise<PaymentHistorySummary> {
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [groups, connections] = await Promise.all([
    db.select({ status: payments.status, count: sql<number>`count(*)::int`, recent: sql<number>`count(*) filter (where ${gte(payments.createdAt, since)})::int` })
      .from(payments).where(and(eq(payments.organizationId, organizationId), eq(payments.mode, mode))).groupBy(payments.status),
    db.select({ count: sql<number>`count(distinct ${providerConnections.providerId})::int` }).from(providerConnections)
      .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.environment, mode === "test" ? "sandbox" : "production"), eq(providerConnections.status, "connected"))),
  ]);
  const counts = Object.fromEntries(groups.map((group) => [group.status, group.count]));
  const completed = groups.find((group) => group.status === "completed")?.recent ?? 0;
  const concluded = groups.filter((group) => ["completed", "failed", "returned"].includes(group.status)).reduce((sum, group) => sum + group.recent, 0);
  return {
    counts, total: groups.reduce((sum, group) => sum + group.count, 0), completed,
    open: groups.filter((group) => ["ready", "requires_approval", "submitting", "processing", "awaiting_funds", "unknown"].includes(group.status)).reduce((sum, group) => sum + group.count, 0),
    connectedProviders: connections[0]?.count ?? 0,
    successRate: concluded ? Math.round(completed / concluded * 1000) / 10 : null,
  };
}
