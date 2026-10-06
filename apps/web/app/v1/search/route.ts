import { NextResponse } from "next/server";
import { getActivePolicyVersion, getDefaultActivePolicy, getPolicy, searchPreview } from "@railor/core";
import type { PolicyRules } from "@railor/types";
import { z } from "zod";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../lib/api-auth";
import { buildFetchQuote, parsePaymentIntentBody } from "../../../lib/decisions";
import { platformQuoteProviders } from "../../../lib/platform-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview evaluates the same engine as /v1/decisions, but never persists a Decision or initiates a payment. */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const body = z.record(z.string(), z.unknown()).parse(await request.json());
    const intentBody = body.intent && typeof body.intent === "object" && !Array.isArray(body.intent)
      ? body.intent as Record<string, unknown> : body;
    const parsed = parsePaymentIntentBody({ ...intentBody, preference: body.preference ?? intentBody.preference });
    if (!parsed.success) throw new ApiError(400, "invalid_intent", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const policyId = body.policy_id === undefined ? undefined : z.string().uuid().parse(body.policy_id);
    const active = policyId ? await getActivePolicyVersion(context.organizationId, policyId) : await getDefaultActivePolicy(context.organizationId);
    if (!active) {
      if (policyId && !(await getPolicy(context.organizationId, policyId))) throw new ApiError(404, "policy_not_found", "No policy with that id for this organization.");
      throw new ApiError(409, policyId ? "policy_not_active" : "no_active_policy", "Create and activate an organization policy before searching.");
    }
    const preview = await searchPreview(parsed.data, {
      policyId: active.policy.id,
      policyVersionId: active.version.id,
      policyVersionNumber: active.version.versionNumber,
      rules: active.version.rules as PolicyRules,
    }, { organizationId: context.organizationId, fetchQuote: buildFetchQuote(context.organizationId, false, true), referenceQuoteProviders: platformQuoteProviders() });
    await recordUsage(context, "/v1/search", "POST", 200, Date.now() - started);
    return NextResponse.json({ ...preview, requestId: context.requestId });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
    await recordUsage(context, "/v1/search", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code: error instanceof ApiError ? error.code : status === 400 ? "invalid_request" : "internal_error", message: error instanceof ApiError ? error.message : status === 400 ? "Check the request fields." : "Unable to search now. Please retry." } }, { status });
  }
}
