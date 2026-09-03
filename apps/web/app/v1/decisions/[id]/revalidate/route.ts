import { NextResponse } from "next/server";
import { getPolicyVersion, revalidateDecision } from "@railor/core";
import { RevalidationTrigger, type PolicyRules } from "@railor/types";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../../../lib/api-auth";
import { buildFetchQuote, serializeDecisionById } from "../../../../../lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/decisions/{id}/revalidate
 *
 * Re-runs the exact same deterministic Decision Engine against current data.
 * Never edits the original Decision — creates a brand-new one linked via
 * previous_decision_id, and appends events on both. `trigger` documents why
 * (quote_expired, evidence_changed, provider_incident, policy_changed,
 * route_changed, connection_state_changed, or manual); `policy_version_id`
 * is only honored for a policy_changed trigger — every other trigger reuses
 * the original Decision's own (immutable) policy version.
 */
export async function POST(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const triggerParsed = RevalidationTrigger.safeParse(body.trigger ?? "manual");
    if (!triggerParsed.success) {
      throw new ApiError(400, "invalid_trigger", `trigger must be one of: ${RevalidationTrigger.options.join(", ")}.`);
    }

    let policyOverride: { policyId: string; policyVersionId: string; policyVersionNumber: number; rules: PolicyRules } | undefined;
    if (triggerParsed.data === "policy_changed") {
      const newVersionId = typeof body.policy_version_id === "string" ? body.policy_version_id : undefined;
      if (!newVersionId) throw new ApiError(400, "policy_version_id_required", "A policy_changed revalidation requires policy_version_id.");
      const version = await getPolicyVersion(context.organizationId, newVersionId);
      if (!version) throw new ApiError(404, "policy_version_not_found", "No policy version with that id for this organization.");
      policyOverride = { policyId: version.policyId, policyVersionId: version.id, policyVersionNumber: version.versionNumber, rules: version.rules as unknown as PolicyRules };
    }

    const result = await revalidateDecision(id, {
      organizationId: context.organizationId,
      trigger: triggerParsed.data,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      fetchQuote: buildFetchQuote(context.organizationId),
      policyOverride,
    });

    if (!result.ok) {
      const status = result.error === "decision_not_found" ? 404 : 400;
      throw new ApiError(status, result.error, "Revalidation could not be completed.");
    }

    const payload = await serializeDecisionById(context.organizationId, result.decisionId);
    await recordUsage(context, "/v1/decisions/:id/revalidate", "POST", 200, Date.now() - started);
    return NextResponse.json({
      ...payload,
      request_id: context.requestId,
      previous_decision_id: result.previousDecisionId,
      recommendation_changed: result.recommendationChanged,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/decisions/:id/revalidate", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
