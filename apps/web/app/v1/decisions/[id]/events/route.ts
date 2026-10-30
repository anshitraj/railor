import { NextResponse } from "next/server";
import { loadDecisionEvents } from "@railor/core";
import { ApiError, authenticate, recordUsage, normalizeApiError, snake, type ApiContext } from "../../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /v1/decisions/{id}/events — the full audit trail: created, revalidation_requested, revalidated, recommendation_changed, and any other state transition this Decision went through, oldest first. */
export async function GET(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const events = await loadDecisionEvents(context.organizationId, id);
    if (events === null) throw new ApiError(404, "decision_not_found", "No decision with that id for this organization.");

    await recordUsage(context, "/v1/decisions/:id/events", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "decision_events",
      request_id: context.requestId,
      decision_id: id,
      data: events.map((e) => snake(e as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    const { status, code, message } = normalizeApiError(error, context?.requestId);
    await recordUsage(context, "/v1/decisions/:id/events", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", request_id: context?.requestId, error: { code, message } }, { status });
  }
}
