import { NextResponse } from "next/server";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../../../lib/api-auth";
import {
  getOwnedWatchlist,
  listWatchlistAlerts,
  serializeAlert,
} from "../../../../../lib/watchlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/watchlists/{id}/alerts — what this monitor has raised, newest first. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const row = await getOwnedWatchlist(context.organizationId, id);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100);
    const rows = await listWatchlistAlerts(context.organizationId, row.id, limit);

    await recordUsage(context, "/v1/watchlists/:id/alerts", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "list",
      request_id: context.requestId,
      data: rows.map(serializeAlert),
      has_more: rows.length === limit,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/watchlists/:id/alerts", "GET", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
