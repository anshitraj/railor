import { and, asc, eq, gt, lt, or, isNull, sql } from "drizzle-orm";
import { decisionMonitorChecks, decisions, getDb, productEvents } from "@railor/database";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { getActivePolicyVersion, persistDecision } from "./decision-repository.js";
import { runDecisionEngine } from "./decision-engine.js";
import { loadConnectorQuote } from "./connectors.js";

/** Bounded scheduled polling of recent decisions. A lease prevents overlapping
 * scheduler runs from duplicating revalidation. Old audit records are retained.
 * A failed check never confers authorization. No provider calls or paid research. */
export async function monitorDecisions(options: { organizationId?: string; limit?: number; now?: Date } = {}) {
  const db = await getDb();
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const candidates = await db.select({ decision: decisions }).from(decisions)
    .leftJoin(decisionMonitorChecks, eq(decisionMonitorChecks.decisionId, decisions.id))
    .where(and(options.organizationId ? eq(decisions.organizationId, options.organizationId) : undefined,
      eq(decisions.revalidationRequired, false), gt(decisions.evaluatedAt, new Date(now.getTime() - 7 * 86400_000)),
      or(isNull(decisionMonitorChecks.decisionId), and(lt(decisionMonitorChecks.leaseUntil, now), lt(decisionMonitorChecks.checkedAt, new Date(now.getTime() - 60_000))))))
    .orderBy(sql`${decisionMonitorChecks.checkedAt} ASC NULLS FIRST`, asc(decisions.evaluatedAt)).limit(limit);
  const summary = { checked: 0, changed: 0, failed: 0 };
  for (const { decision } of candidates) {
    const leaseUntil = new Date(now.getTime() + 120_000);
    const claim = await db.insert(decisionMonitorChecks).values({ decisionId: decision.id, checkedAt: now, leaseUntil })
      .onConflictDoUpdate({ target: decisionMonitorChecks.decisionId, set: { leaseUntil, checkedAt: now },
        setWhere: and(lt(decisionMonitorChecks.leaseUntil, now), lt(decisionMonitorChecks.checkedAt, new Date(now.getTime() - 60_000))) }).returning();
    if (!claim.length) continue;
    summary.checked++;
    try {
      const active = await getActivePolicyVersion(decision.organizationId, decision.policyId);
      if (!active) throw new Error("active_policy_required");
      const fresh = await runDecisionEngine(PaymentIntent.parse(decision.intentSnapshot), {
        policyId: active.policy.id, policyVersionId: active.version.id, policyVersionNumber: active.version.versionNumber,
        rules: PolicyRules.parse(active.version.rules),
      }, { organizationId: decision.organizationId, now, mode: decision.mode as "enforce" | "optimize",
        proposedExecutor: decision.proposedExecutor ? { provider: decision.proposedExecutor } : undefined,
        createdBy: decision.createdBy ?? undefined, previousDecisionId: decision.id,
        fetchQuote: (slug, _id, request) => loadConnectorQuote(decision.organizationId, slug, request) });
      if (fresh.decisionHash !== decision.decisionHash || (decision.validUntil && decision.validUntil <= now)) {
        const claimed = await db.update(decisions).set({ revalidationRequired: true }).where(and(eq(decisions.id, decision.id), eq(decisions.revalidationRequired, false))).returning();
        if (!claimed.length) continue;
        const next = await persistDecision(fresh);
        await db.insert(productEvents).values({ organizationId: decision.organizationId, kind: "decision_monitor_changed", targetId: decision.id,
          data: { nextDecisionId: next.id, before: decision.status, after: fresh.status } });
        summary.changed++;
      }
    } catch {
      await db.update(decisions).set({ revalidationRequired: true }).where(eq(decisions.id, decision.id));
      await db.insert(productEvents).values({ organizationId: decision.organizationId, kind: "decision_monitor_failed", targetId: decision.id,
        data: { reason: "Automatic revalidation failed. Manual review is required." } });
      summary.failed++;
    } finally {
      await db.update(decisionMonitorChecks).set({ leaseUntil: now }).where(eq(decisionMonitorChecks.decisionId, decision.id));
    }
  }
  return summary;
}
