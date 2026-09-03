import { NextResponse } from "next/server";
import { getPolicy, listPolicyVersions } from "@railor/core";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /v1/policies/{id} — one policy plus every version (newest first), so a caller can see the full DRAFT/ACTIVE/SUPERSEDED history without a second call. */
export async function GET(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const policy = await getPolicy(context.organizationId, id);
    if (!policy) throw new ApiError(404, "policy_not_found", "No policy with that id for this organization.");
    const versions = await listPolicyVersions(context.organizationId, id);

    await recordUsage(context, "/v1/policies/:id", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "policy",
      request_id: context.requestId,
      data: {
        ...snake(policy as unknown as Record<string, unknown>),
        versions: versions.map((v) => snake(v as unknown as Record<string, unknown>)),
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/policies/:id", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
