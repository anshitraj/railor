/**
 * DB access for the control plane: Policy CRUD and Decision persistence.
 *
 * Every function here takes `organizationId` and filters by it explicitly -
 * the same application-layer isolation discipline the rest of this codebase
 * already uses (no Postgres RLS anywhere; see apps/web/lib/connections.ts
 * for the existing pattern this mirrors). A lookup for an object that
 * belongs to a different organization returns null/empty, never throws and
 * never leaks whether the id exists at all.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  decisionCandidates,
  decisionEvents,
  decisions,
  getDb,
  incidents,
  policies,
  policyVersions,
} from "@railor/database";
import type {
  CandidatePolicyEvaluation,
  CostCompleteness,
  DecisionEventKind,
  DecisionStatus,
  EntityEligibility,
  PolicyRules,
  QuoteSnapshot,
  RouteConfirmation,
} from "@railor/types";

/* -------------------------------------------------------------------------- */
/* Policy                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A malformed (non-UUID) id must read as "not found," not reach the driver -
 * Postgres rejects an invalid uuid literal with a raw driver error that (a)
 * isn't the ApiError shape every route already normalizes into a clean 4xx
 * and (b) echoes the full query text, including the caller's own
 * organizationId, straight into the response body. Every id-keyed lookup
 * below checks this first so a client typo returns the same 404 a
 * well-formed-but-nonexistent id would.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string): boolean => UUID_RE.test(value);

export async function listPolicies(organizationId: string) {
  const db = await getDb();
  return db.select().from(policies).where(eq(policies.organizationId, organizationId)).orderBy(desc(policies.createdAt));
}

export async function getPolicy(organizationId: string, policyId: string) {
  if (!isUuid(policyId)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.id, policyId), eq(policies.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function getPolicyVersion(organizationId: string, versionId: string) {
  if (!isUuid(versionId)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(policyVersions)
    .where(and(eq(policyVersions.id, versionId), eq(policyVersions.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listPolicyVersions(organizationId: string, policyId: string) {
  if (!isUuid(policyId)) return [];
  const db = await getDb();
  return db
    .select()
    .from(policyVersions)
    .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.organizationId, organizationId)))
    .orderBy(desc(policyVersions.versionNumber));
}

/** Creates a policy with one DRAFT version (version 1). */
export async function createPolicy(organizationId: string, name: string, rules: PolicyRules) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [policy] = await tx.insert(policies).values({ organizationId, name, status: "draft" }).returning();
    const [version] = await tx
      .insert(policyVersions)
      .values({ policyId: policy!.id, organizationId, versionNumber: 1, status: "draft", rules })
      .returning();
    return { policy: policy!, version: version! };
  });
}

/** Always creates a brand-new DRAFT version - an active/superseded version is never mutated in place. */
export async function createPolicyVersion(organizationId: string, policyId: string, rules: PolicyRules) {
  const db = await getDb();
  const policy = await getPolicy(organizationId, policyId);
  if (!policy) return null;
  const existing = await listPolicyVersions(organizationId, policyId);
  const nextVersionNumber = (existing[0]?.versionNumber ?? 0) + 1;
  const [version] = await db
    .insert(policyVersions)
    .values({ policyId, organizationId, versionNumber: nextVersionNumber, status: "draft", rules })
    .returning();
  return version!;
}

/**
 * Activates a version: the target becomes ACTIVE, any previously-active
 * version of the same policy becomes SUPERSEDED (with supersededAt stamped),
 * and policies.activeVersionId/status are updated to match. Immutable once
 * done - activating again is a no-op re-read, never a re-activation of an
 * already-superseded version (the version's own status gates that).
 */
export async function activatePolicyVersion(organizationId: string, policyId: string, versionId: string) {
  const db = await getDb();
  const policy = await getPolicy(organizationId, policyId);
  if (!policy) return { ok: false as const, error: "policy_not_found" };
  const version = await getPolicyVersion(organizationId, versionId);
  if (!version || version.policyId !== policyId) return { ok: false as const, error: "version_not_found" };
  if (version.status === "superseded" || version.status === "disabled") {
    return { ok: false as const, error: "version_not_activatable" };
  }
  if (version.status === "active") return { ok: true as const, policy, version };

  const now = new Date();
  return db.transaction(async (tx) => {
    if (policy.activeVersionId) {
      await tx
        .update(policyVersions)
        .set({ status: "superseded", supersededAt: now })
        .where(and(eq(policyVersions.id, policy.activeVersionId), eq(policyVersions.organizationId, organizationId)));
    }
    const [activated] = await tx
      .update(policyVersions)
      .set({ status: "active", activatedAt: now })
      .where(and(eq(policyVersions.id, versionId), eq(policyVersions.organizationId, organizationId)))
      .returning();
    const [updatedPolicy] = await tx
      .update(policies)
      .set({ status: "active", activeVersionId: versionId, updatedAt: now })
      .where(and(eq(policies.id, policyId), eq(policies.organizationId, organizationId)))
      .returning();
    return { ok: true as const, policy: updatedPolicy!, version: activated! };
  });
}

/** The policy + its currently-active version, or null if the policy has never been activated (a DRAFT-only policy cannot back a Decision). */
export async function getActivePolicyVersion(organizationId: string, policyId: string) {
  const policy = await getPolicy(organizationId, policyId);
  if (!policy?.activeVersionId) return null;
  const version = await getPolicyVersion(organizationId, policy.activeVersionId);
  if (!version) return null;
  return { policy, version };
}

/** The org's single active policy, when there is exactly one - used when a Decision request doesn't name a policyId explicitly. */
export async function getDefaultActivePolicy(organizationId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(policies)
    .where(and(eq(policies.organizationId, organizationId), eq(policies.status, "active")))
    .orderBy(desc(policies.updatedAt))
    .limit(1);
  const policy = rows[0];
  if (!policy?.activeVersionId) return null;
  const version = await getPolicyVersion(organizationId, policy.activeVersionId);
  if (!version) return null;
  return { policy, version };
}

/* -------------------------------------------------------------------------- */
/* Incidents (read-only signal for the denyDuringActiveIncident rule)          */
/* -------------------------------------------------------------------------- */

/** Provider ids with at least one unresolved incident right now - real monitoring data, not derived or guessed. */
export async function loadProviderIdsWithActiveIncidents(providerIds: string[]): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ providerId: incidents.providerId })
    .from(incidents)
    .where(and(inArray(incidents.providerId, providerIds), eq(incidents.status, "investigating")));
  // "identified"/"monitoring" are still open incidents, not just "investigating" -
  // union all three non-resolved statuses.
  const rows2 = await db
    .select({ providerId: incidents.providerId })
    .from(incidents)
    .where(and(inArray(incidents.providerId, providerIds), eq(incidents.status, "identified")));
  const rows3 = await db
    .select({ providerId: incidents.providerId })
    .from(incidents)
    .where(and(inArray(incidents.providerId, providerIds), eq(incidents.status, "monitoring")));
  return new Set([...rows, ...rows2, ...rows3].map((r) => r.providerId));
}

/* -------------------------------------------------------------------------- */
/* Decision persistence                                                       */
/* -------------------------------------------------------------------------- */

export interface DecisionCandidateInsert {
  providerId: string;
  providerSlug: string;
  providerName: string;
  routeId: string | null;
  eligibilityStatus: "supported" | "additional_requirements" | "unavailable" | "unknown";
  routeCertainty: RouteConfirmation | null;
  entityEligibility: EntityEligibility | null;
  policyEvaluation: CandidatePolicyEvaluation;
  quoteSnapshot: QuoteSnapshot | null;
  costCompleteness: CostCompleteness;
  reliabilitySnapshot: number | null;
  rank: number | null;
  selected: boolean;
  rejectionReasonCodes: string[];
  evidenceIds: string[];
}

export interface DecisionInsert {
  organizationId: string;
  intentSnapshot: Record<string, unknown>;
  policyId: string;
  policyVersionId: string;
  policyVersionNumber: number;
  engineVersion: string;
  status: DecisionStatus;
  recommendedProviderId: string | null;
  recommendedProviderSlug: string | null;
  recommendedRouteId: string | null;
  certainty: RouteConfirmation | null;
  rankingConfidence: number;
  quoteState: "live" | "indicative" | "historical" | "none";
  connectionState: "connected" | "not_connected" | "mixed" | "unknown";
  validUntil: Date | null;
  revalidationRequired: boolean;
  decisionHash: string;
  warnings: string[];
  explain: Record<string, unknown>;
  previousDecisionId: string | null;
  candidates: DecisionCandidateInsert[];
}

/** Inserts a Decision, its candidates and a `created` (or `revalidated`) event, all in one transaction. Never updates an existing Decision row - every call is a new, immutable record. */
export async function persistDecision(input: DecisionInsert) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [decision] = await tx
      .insert(decisions)
      .values({
        organizationId: input.organizationId,
        intentSnapshot: input.intentSnapshot,
        policyId: input.policyId,
        policyVersionId: input.policyVersionId,
        policyVersionNumber: input.policyVersionNumber,
        engineVersion: input.engineVersion,
        status: input.status,
        recommendedProviderId: input.recommendedProviderId,
        recommendedProviderSlug: input.recommendedProviderSlug,
        recommendedRouteId: input.recommendedRouteId,
        certainty: input.certainty,
        rankingConfidence: String(input.rankingConfidence),
        quoteState: input.quoteState,
        connectionState: input.connectionState,
        validUntil: input.validUntil,
        revalidationRequired: input.revalidationRequired,
        decisionHash: input.decisionHash,
        warnings: input.warnings,
        explain: input.explain,
        previousDecisionId: input.previousDecisionId,
      })
      .returning();

    if (input.candidates.length) {
      await tx.insert(decisionCandidates).values(
        input.candidates.map((c) => ({
          decisionId: decision!.id,
          organizationId: input.organizationId,
          providerId: c.providerId,
          providerSlug: c.providerSlug,
          providerName: c.providerName,
          routeId: c.routeId,
          eligibilityStatus: c.eligibilityStatus,
          routeCertainty: c.routeCertainty,
          entityEligibility: c.entityEligibility,
          policyResult: c.policyEvaluation.result,
          policyReasonCodes: c.policyEvaluation.ruleResults.filter((r) => r.code).map((r) => r.code!),
          quoteSnapshot: c.quoteSnapshot,
          quoteType: c.quoteSnapshot?.quoteType ?? null,
          quoteObservedAt: c.quoteSnapshot ? new Date(c.quoteSnapshot.observedAt) : null,
          quoteExpiresAt: c.quoteSnapshot?.expiresAt ? new Date(c.quoteSnapshot.expiresAt) : null,
          costCompleteness: c.costCompleteness,
          reliabilitySnapshot: c.reliabilitySnapshot === null ? null : String(c.reliabilitySnapshot),
          rank: c.rank,
          selected: c.selected,
          rejectionReasonCodes: c.rejectionReasonCodes,
          evidenceIds: c.evidenceIds,
        })),
      );
    }

    await tx.insert(decisionEvents).values({
      decisionId: decision!.id,
      organizationId: input.organizationId,
      kind: input.previousDecisionId ? "revalidated" : "created",
      detail: input.previousDecisionId
        ? `Decision revalidated from ${input.previousDecisionId}.`
        : "Decision created.",
      data: { status: input.status, recommendedProviderSlug: input.recommendedProviderSlug },
    });

    return decision!;
  });
}

export async function loadDecision(organizationId: string, decisionId: string) {
  if (!isUuid(decisionId)) return null;
  const db = await getDb();
  const [decision] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.id, decisionId), eq(decisions.organizationId, organizationId)))
    .limit(1);
  if (!decision) return null;
  const candidates = await db
    .select()
    .from(decisionCandidates)
    .where(and(eq(decisionCandidates.decisionId, decisionId), eq(decisionCandidates.organizationId, organizationId)))
    .orderBy(decisionCandidates.rank);
  return { decision, candidates };
}

export async function loadDecisionEvents(organizationId: string, decisionId: string) {
  if (!isUuid(decisionId)) return null;
  const db = await getDb();
  // Confirm the decision actually belongs to this org before returning any
  // events for it - same isolation discipline as loadDecision.
  const [owns] = await db
    .select({ id: decisions.id })
    .from(decisions)
    .where(and(eq(decisions.id, decisionId), eq(decisions.organizationId, organizationId)))
    .limit(1);
  if (!owns) return null;
  return db
    .select()
    .from(decisionEvents)
    .where(and(eq(decisionEvents.decisionId, decisionId), eq(decisionEvents.organizationId, organizationId)))
    .orderBy(decisionEvents.createdAt);
}

export async function appendDecisionEvent(
  organizationId: string,
  decisionId: string,
  kind: DecisionEventKind,
  detail: string,
  data: Record<string, unknown> = {},
) {
  if (!isUuid(decisionId)) return null;
  const db = await getDb();
  const [owns] = await db
    .select({ id: decisions.id })
    .from(decisions)
    .where(and(eq(decisions.id, decisionId), eq(decisions.organizationId, organizationId)))
    .limit(1);
  if (!owns) return null;
  const [event] = await db.insert(decisionEvents).values({ decisionId, organizationId, kind, detail, data }).returning();
  return event!;
}

export async function markRevalidationRequired(organizationId: string, decisionId: string) {
  if (!isUuid(decisionId)) return;
  const db = await getDb();
  await db
    .update(decisions)
    .set({ revalidationRequired: true })
    .where(and(eq(decisions.id, decisionId), eq(decisions.organizationId, organizationId)));
}
