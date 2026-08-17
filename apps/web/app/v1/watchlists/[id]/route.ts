import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, watchlists } from "@railor/database";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../../lib/api-auth";
import {
  getOwnedWatchlist,
  listWatchlistAlerts,
  serializeAlert,
  serializeWatchlist,
  WatchlistUpdate,
} from "../../../../lib/watchlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /v1/watchlists/{id} — one monitor plus its ten most recent alerts. */
export async function GET(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const row = await getOwnedWatchlist(context.organizationId, id);
    const recent = await listWatchlistAlerts(context.organizationId, row.id, 10);

    await recordUsage(context, "/v1/watchlists/:id", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "watchlist_detail",
      request_id: context.requestId,
      data: {
        ...serializeWatchlist(row),
        recent_alerts: recent.map(serializeAlert),
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/watchlists/:id", "GET", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}

/** PATCH /v1/watchlists/{id} — retune kinds, digest, label or email channel. */
export async function PATCH(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const row = await getOwnedWatchlist(context.organizationId, id);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = WatchlistUpdate.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_request",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const db = await getDb();
    const [updated] = await db
      .update(watchlists)
      .set({
        label: parsed.data.label,
        kinds: parsed.data.kinds,
        channelEmail: parsed.data.channel_email,
        digest: parsed.data.digest,
      })
      .where(eq(watchlists.id, row.id))
      .returning();

    await recordUsage(context, "/v1/watchlists/:id", "PATCH", 200, Date.now() - started);
    return NextResponse.json({
      object: "watchlist",
      request_id: context.requestId,
      data: serializeWatchlist(updated ?? row),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/watchlists/:id", "PATCH", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}

/** DELETE /v1/watchlists/{id} — disarm. The change events it raised stay on record. */
export async function DELETE(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const row = await getOwnedWatchlist(context.organizationId, id);

    const db = await getDb();
    await db.delete(watchlists).where(eq(watchlists.id, row.id));

    await recordUsage(context, "/v1/watchlists/:id", "DELETE", 200, Date.now() - started);
    return NextResponse.json({
      object: "watchlist",
      request_id: context.requestId,
      id: row.id,
      deleted: true,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/watchlists/:id", "DELETE", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
