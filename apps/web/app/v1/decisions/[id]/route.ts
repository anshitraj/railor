import { NextResponse } from "next/server";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../../lib/api-auth";
import { serializeDecisionById } from "../../../../lib/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /v1/decisions/{id} — the full, immutable Decision record: intent snapshot, every candidate considered, and why. Returns 404 for a Decision belonging to a different organization, not 403 — existence is not disclosed across tenants. */
export async function GET(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const payload = await serializeDecisionById(context.organizationId, id);
    if (!payload) throw new ApiError(404, "decision_not_found", "No decision with that id for this organization.");

    await recordUsage(context, "/v1/decisions/:id", "GET", 200, Date.now() - started);
    return NextResponse.json({ ...payload, request_id: context.requestId });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/decisions/:id", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
