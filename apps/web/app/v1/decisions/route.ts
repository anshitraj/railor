import { NextResponse } from "next/server";
import { getDefaultActivePolicy, getActivePolicyVersion, getPolicy, persistDecision, runDecisionEngine, listDecisions, DecisionListQuery } from "@railor/core";
import type { PolicyRules } from "@railor/types";
import { z } from "zod";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../lib/api-auth";
import { buildFetchQuote, parsePaymentIntentBody, serializeDecisionById } from "../../../lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/decisions
 *
 * The control-plane's core endpoint: PaymentIntent in, a persisted, auditable
 * Decision out. Authenticates the organization, loads its active policy
 * (explicit policy_id or the org's one active policy), runs the existing
 * eligibility/ranking engine plus the deterministic Policy Evaluator over
 * every real (non-demo) provider, requests a live quote only from
 * already-connected, already-policy-surviving candidates, ranks
 * deterministically, and persists the full result transactionally before
 * returning it. No web research, no LLM call, no fabricated data anywhere in
 * this path — a candidate with no evidence is `unknown`, not guessed.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = z.enum(["enforce", "optimize"]).optional().parse(body.mode);
    const proposedExecutor = z.object({ provider: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,100}$/) }).optional().parse(body.proposed_executor ?? body.proposedExecutor);

    const intentBody = (body.intent && typeof body.intent === "object" ? body.intent : body) as Record<string, unknown>;
    const parsedIntent = parsePaymentIntentBody(intentBody);
    if (!parsedIntent.success) {
      throw new ApiError(400, "invalid_intent", parsedIntent.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const policyId = typeof body.policy_id === "string" ? body.policy_id : undefined;
    const resolved = policyId
      ? await getActivePolicyVersion(context.organizationId, policyId)
      : await getDefaultActivePolicy(context.organizationId);
    if (!resolved) {
      if (policyId && !(await getPolicy(context.organizationId, policyId))) {
        throw new ApiError(404, "policy_not_found", "No policy with that id for this organization.");
      }
      throw new ApiError(
        409,
        policyId ? "policy_not_active" : "no_active_policy",
        policyId
          ? "The named policy has no active version. Activate a version before requesting a decision."
          : "This organization has no active policy. Create and activate one first (POST /v1/policies, POST /v1/policies/:id/activate).",
      );
    }

    const decisionInput = await runDecisionEngine(
      parsedIntent.data,
      {
        policyId: resolved.policy.id,
        policyVersionId: resolved.version.id,
        policyVersionNumber: resolved.version.versionNumber,
        rules: resolved.version.rules as unknown as PolicyRules,
      },
      { organizationId: context.organizationId, mode, proposedExecutor,
        fetchQuote: buildFetchQuote(context.organizationId, Boolean(mode === "enforce" || proposedExecutor)) },
    );

    const created = await persistDecision(decisionInput);
    const payload = await serializeDecisionById(context.organizationId, created.id);

    await recordUsage(context, "/v1/decisions", "POST", 200, Date.now() - started);
    return NextResponse.json({ ...payload, request_id: context.requestId });
  } catch (error) {
    const known = error instanceof Error && ["proposed_executor_required", "executor_requires_enforce_mode", "provider_not_found"].includes(error.message);
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError || known ? 400 : 500;
    const code = error instanceof ApiError ? error.code : known ? (error as Error).message : status === 400 ? "invalid_request" : "internal_error";
    await recordUsage(context, "/v1/decisions", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: error instanceof ApiError ? error.message : status === 400 ? "Check the request fields, mode and proposed provider." : "Unable to create the decision. Please retry." } }, { status });
  }
}

export async function GET(request: Request) {
  const started = Date.now(); let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const params = new URL(request.url).searchParams;
    const query = DecisionListQuery.parse({ status: params.get("status") ?? undefined, search: params.get("search") ?? undefined,
      before: params.get("before") ?? undefined, beforeId: params.get("before_id") ?? undefined, limit: params.get("limit") ?? undefined });
    const rows = await listDecisions(context.organizationId, query);
    await recordUsage(context, "/v1/decisions", "GET", 200, Date.now() - started);
    return NextResponse.json({ object: "list", request_id: context.requestId,
      data: rows.map((d) => ({ id: d.id, status: d.status, mode: d.mode, provider: d.proposedExecutor ?? d.recommendedProviderSlug, intent: d.intentSnapshot, evaluated_at: d.evaluatedAt.toISOString(), decision_hash: d.decisionHash })),
      next: rows.length === query.limit ? { before: rows.at(-1)!.evaluatedAt.toISOString(), before_id: rows.at(-1)!.id } : null });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : status === 400 ? "invalid_request" : "internal_error" }, { status });
  }
}
