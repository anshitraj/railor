import { and, desc, eq, lt, or, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { decisions, decisionApprovals, organizationMembers, policies, productEvents, getDb } from "@railor/database";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { getPolicyVersion, loadDecision } from "./decision-repository.js";
import { runDecisionEngine } from "./decision-engine.js";
import { loadConnectorQuote } from "./connectors.js";

/** The actor is resolved from an authenticated session, never from a body field. */
export async function requireProductRole(organizationId: string, actorId: string, admin = false) {
  const db = await getDb();
  const [membership] = await db.select().from(organizationMembers).where(and(
    eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, actorId),
  )).limit(1);
  if (!membership || (admin ? !["owner", "admin"].includes(membership.role) : membership.role === "viewer")) throw new Error("forbidden");
  return membership.role;
}

export const DecisionListQuery = z.object({
  status: z.enum(["allow", "deny", "approval_required", "insufficient_data", "no_verified_route"]).optional(),
  search: z.string().max(120).optional(),
  before: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function listDecisions(organizationId: string, raw: unknown = {}) {
  const query = DecisionListQuery.parse(raw);
  const db = await getDb();
  const term = query.search?.replace(/[\\%_]/g, "\\$&");
  return db.select().from(decisions).where(and(
    eq(decisions.organizationId, organizationId),
    query.status ? eq(decisions.status, query.status) : undefined,
    query.before ? or(lt(decisions.evaluatedAt, new Date(query.before)), query.beforeId ? and(eq(decisions.evaluatedAt, new Date(query.before)), lt(decisions.id, query.beforeId)) : undefined) : undefined,
    term ? or(ilike(decisions.recommendedProviderSlug, `%${term}%`), ilike(decisions.proposedExecutor, `%${term}%`),
      sql`${decisions.intentSnapshot}::text ILIKE ${`%${term}%`}`, sql`${decisions.id}::text ILIKE ${`%${term}%`}`) : undefined,
  )).orderBy(desc(decisions.evaluatedAt), desc(decisions.id)).limit(query.limit);
}

export async function listApprovals(organizationId: string) {
  const db = await getDb();
  const rows = await db.select().from(decisionApprovals).where(eq(decisionApprovals.organizationId, organizationId))
    .orderBy(desc(decisionApprovals.createdAt)).limit(100);
  const now = Date.now();
  return rows.map((row) => ({ ...row, status: ["pending", "approved"].includes(row.status) && row.expiresAt.getTime() <= now ? "expired" : row.status }));
}

export async function reviewApproval(organizationId: string, actorId: string, raw: unknown) {
  const input = z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "revoke"]), comment: z.string().trim().min(1).max(2000) }).parse(raw);
  await requireProductRole(organizationId, actorId, true);
  const db = await getDb();
  const [approval] = await db.select().from(decisionApprovals).where(and(
    eq(decisionApprovals.id, input.id), eq(decisionApprovals.organizationId, organizationId),
  )).limit(1);
  if (!approval) throw new Error("approval_not_found");
  if (input.action === "approve" && approval.requestedBy === actorId) throw new Error("self_approval_forbidden");
  if (input.action !== "revoke" && approval.expiresAt.getTime() <= Date.now()) throw new Error("approval_expired");
  const expected = input.action === "revoke" ? "approved" : "pending";
  if (approval.status !== expected) throw new Error("approval_already_resolved");
  const loaded = await loadDecision(organizationId, approval.decisionId);
  if (!loaded) throw new Error("decision_not_found");
  if (input.action === "approve") {
    if (loaded.decision.revalidationRequired) throw new Error("revalidation_required");
    const version = await getPolicyVersion(organizationId, loaded.decision.policyVersionId);
    if (!version || version.status !== "active") throw new Error("policy_changed_revalidate_first");
    // Re-evaluate before granting an approval: a historical pass cannot hide
    // a new incident or changed evidence. A changed result needs fresh review.
    const fresh = await runDecisionEngine(PaymentIntent.parse(loaded.decision.intentSnapshot), {
      policyId: version.policyId, policyVersionId: version.id, policyVersionNumber: version.versionNumber,
      rules: PolicyRules.parse(version.rules),
    }, { organizationId, mode: loaded.decision.mode as "enforce" | "optimize",
      proposedExecutor: loaded.decision.proposedExecutor ? { provider: loaded.decision.proposedExecutor } : undefined,
      fetchQuote: (slug, _id, request) => loadConnectorQuote(organizationId, slug, request) });
    if (fresh.status !== "approval_required" || fresh.decisionHash !== approval.decisionHash) throw new Error("decision_changed_revalidate_first");
  }
  return db.transaction(async (tx) => {
    // Policy activation also locks this row, serializing activation vs grant.
    const [policy] = await tx.select().from(policies).where(and(eq(policies.id, loaded.decision.policyId), eq(policies.organizationId, organizationId))).for("update");
    if (input.action === "approve" && policy?.activeVersionId !== loaded.decision.policyVersionId) throw new Error("policy_changed_revalidate_first");
    if (input.action === "approve") {
      const [current] = await tx.select().from(decisions).where(and(eq(decisions.id, approval.decisionId), eq(decisions.organizationId, organizationId))).for("update");
      if (!current || current.revalidationRequired || (current.validUntil && current.validUntil.getTime() <= Date.now()) || approval.expiresAt.getTime() <= Date.now()) throw new Error("revalidation_required");
    }
    const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "revoked";
    const [updated] = await tx.update(decisionApprovals).set({ status, reviewedBy: actorId, reviewedAt: new Date(), comment: input.comment,
      ...(status === "approved" ? { expiresAt: new Date(Math.min(approval.expiresAt.getTime(), Date.now() + 15 * 60_000)) } : {}),
    }).where(and(eq(decisionApprovals.id, approval.id), eq(decisionApprovals.status, expected),
      eq(decisionApprovals.organizationId, organizationId))).returning();
    if (!updated) throw new Error("approval_already_resolved");
    await tx.insert(productEvents).values({ organizationId, actorId, kind: `approval_${status}`, targetId: approval.decisionId,
      data: { approvalId: approval.id, comment: input.comment, decisionHash: approval.decisionHash } });
    return updated;
  });
}

export async function decisionAuthorization(organizationId: string, decisionId: string) {
  const loaded = await loadDecision(organizationId, decisionId);
  if (!loaded) return { authorized: false, reason: "decision_not_found" };
  const { decision } = loaded;
  if (decision.revalidationRequired || (decision.validUntil && decision.validUntil.getTime() <= Date.now())) return { authorized: false, reason: "revalidation_required" };
  const version = await getPolicyVersion(organizationId, decision.policyVersionId);
  if (version?.status !== "active") return { authorized: false, reason: "policy_changed" };
  if (decision.status === "allow") return { authorized: true, reason: "policy_allowed" };
  if (decision.status !== "approval_required") return { authorized: false, reason: decision.status };
  const db = await getDb();
  const [approval] = await db.select().from(decisionApprovals).where(and(eq(decisionApprovals.organizationId, organizationId), eq(decisionApprovals.decisionId, decision.id))).limit(1);
  const authorized = Boolean(approval && approval.status === "approved" && approval.decisionHash === decision.decisionHash && approval.expiresAt.getTime() > Date.now());
  return { authorized, reason: authorized ? "human_approved" : "approval_required" };
}
