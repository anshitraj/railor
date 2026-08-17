import { NextResponse } from "next/server";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../lib/api-auth";
import { createWatchlist, listWatchlists, serializeWatchlist, WatchlistCreate } from "../../../lib/watchlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/watchlists — the org's monitors, with unread alert counts. */
export async function GET(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const data = await listWatchlists(context.organizationId);

    await recordUsage(context, "/v1/watchlists", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "list",
      request_id: context.requestId,
      data,
      has_more: false,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/watchlists", "GET", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}

/**
 * POST /v1/watchlists — arm a monitor on a provider, corridor, country,
 * asset or product. Idempotent on (organization, target): creating the same
 * watch twice returns the existing row with `created: false`.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = WatchlistCreate.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_request",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const { row, created } = await createWatchlist(context.organizationId, null, parsed.data);
    const status = created ? 201 : 200;

    await recordUsage(context, "/v1/watchlists", "POST", status, Date.now() - started);
    return NextResponse.json(
      {
        object: "watchlist_result",
        request_id: context.requestId,
        created,
        data: serializeWatchlist(row),
      },
      { status },
    );
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/watchlists", "POST", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
