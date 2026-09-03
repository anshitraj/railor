import { NextResponse } from "next/server";
import { getActivePolicyVersion, getPolicy, getPolicyVersion, simulatePolicy } from "@railor/core";
import { PolicyRules } from "@railor/types";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../../../lib/api-auth";
import { parsePaymentIntentBody } from "../../../../../lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/policies/{id}/simulate
 *
 * Read-only: runs one PaymentIntent against two PolicyVersions (A vs B) and
 * diffs the outcome. Never fetches a live quote and never persists a
 * Decision — see policy-simulator.ts. `version_id` picks side A (defaults to
 * this policy's currently active version); side B is either an existing
 * `version_id_b` or a raw `rules_b` object to try before saving it as a
 * version at all.
 */
export async function POST(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const policy = await getPolicy(context.organizationId, id);
    if (!policy) throw new ApiError(404, "policy_not_found", "No policy with that id for this organization.");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const intentBody = (body.intent && typeof body.intent === "object" ? body.intent : {}) as Record<string, unknown>;
    const parsedIntent = parsePaymentIntentBody(intentBody);
    if (!parsedIntent.success) {
      throw new ApiError(400, "invalid_intent", parsedIntent.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const versionIdA = typeof body.version_id === "string" ? body.version_id : undefined;
    const resolvedA = versionIdA
      ? await getPolicyVersion(context.organizationId, versionIdA)
      : (await getActivePolicyVersion(context.organizationId, id))?.version ?? null;
    if (!resolvedA) {
      throw new ApiError(409, versionIdA ? "version_not_found" : "no_active_policy", "Side A must be a real version id or this policy must have an active version.");
    }

    const versionIdB = typeof body.version_id_b === "string" ? body.version_id_b : undefined;
    let rulesB: unknown = body.rules_b;
    if (versionIdB) {
      const resolvedB = await getPolicyVersion(context.organizationId, versionIdB);
      if (!resolvedB) throw new ApiError(404, "version_b_not_found", "No policy version with that id for this organization.");
      rulesB = resolvedB.rules;
    }
    const parsedRulesB = PolicyRules.safeParse(rulesB ?? {});
    if (!parsedRulesB.success) {
      throw new ApiError(400, "invalid_rules_b", parsedRulesB.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const result = await simulatePolicy(
      parsedIntent.data,
      resolvedA.rules as unknown as PolicyRules,
      parsedRulesB.data,
      { organizationId: context.organizationId },
    );

    await recordUsage(context, "/v1/policies/:id/simulate", "POST", 200, Date.now() - started);
    return NextResponse.json({
      object: "policy_simulation",
      request_id: context.requestId,
      version_id_a: resolvedA.id,
      version_id_b: versionIdB ?? null,
      data: snake(result as unknown as Record<string, unknown>),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/policies/:id/simulate", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
