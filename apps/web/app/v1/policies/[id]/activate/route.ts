import { NextResponse } from "next/server";
import { activatePolicyVersion } from "@railor/core";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/policies/{id}/activate
 *
 * Makes one version ACTIVE and the policy's previously-active version (if
 * any) SUPERSEDED, atomically. The activated version becomes immutable from
 * this point on — no endpoint edits it further; further changes require a
 * new version via POST /v1/policies/{id}/versions.
 */
export async function POST(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const versionId = typeof body.version_id === "string" ? body.version_id : undefined;
    if (!versionId) throw new ApiError(400, "invalid_request", "version_id is required.");

    const result = await activatePolicyVersion(context.organizationId, id, versionId);
    if (!result.ok) {
      const status = result.error === "policy_not_found" || result.error === "version_not_found" ? 404 : 409;
      throw new ApiError(status, result.error, "That version could not be activated.");
    }

    await recordUsage(context, "/v1/policies/:id/activate", "POST", 200, Date.now() - started);
    return NextResponse.json({
      object: "policy",
      request_id: context.requestId,
      data: { ...snake(result.policy as unknown as Record<string, unknown>), active_version: snake(result.version as unknown as Record<string, unknown>) },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/policies/:id/activate", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
