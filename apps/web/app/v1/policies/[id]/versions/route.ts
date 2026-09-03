import { NextResponse } from "next/server";
import { createPolicyVersion, getPolicy } from "@railor/core";
import { PolicyRules } from "@railor/types";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/policies/{id}/versions
 *
 * Always creates a brand-new DRAFT version — there is no endpoint that edits
 * an ACTIVE or SUPERSEDED version in place. "Editing an active policy"
 * means creating a new version here and then POSTing it to /activate.
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
    const parsedRules = PolicyRules.safeParse(body.rules ?? {});
    if (!parsedRules.success) {
      throw new ApiError(400, "invalid_rules", parsedRules.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const version = await createPolicyVersion(context.organizationId, id, parsedRules.data);
    await recordUsage(context, "/v1/policies/:id/versions", "POST", 200, Date.now() - started);
    return NextResponse.json({
      object: "policy_version",
      request_id: context.requestId,
      data: snake(version as unknown as Record<string, unknown>),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/policies/:id/versions", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
