import { NextResponse } from "next/server";
import { loadChangeFeed, parseSince } from "@railor/core";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/changes — detected changes, newest first, with review status. */
export async function GET(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100);
    const provider = url.searchParams.get("provider");
    const sinceRaw = url.searchParams.get("since");

    let since: Date | undefined;
    if (sinceRaw) {
      const parsed = parseSince(sinceRaw);
      if (!parsed) {
        throw new ApiError(
          400,
          "invalid_request",
          `Could not parse \`since\` value "${sinceRaw}". Use a duration like "7d", "24h", "30m" or an ISO date.`,
        );
      }
      since = parsed;
    }

    const feed = await loadChangeFeed({
      limit,
      providerSlugs: provider ? [provider] : undefined,
      since,
    });

    await recordUsage(context, "/v1/changes", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "list",
      request_id: context.requestId,
      data: feed.map(({ change, providerName, providerSlug }) => ({
        object: "change_event",
        id: change.id,
        provider: { slug: providerSlug, name: providerName },
        kind: change.kind,
        field: change.field,
        previous_value: change.previousValue,
        current_value: change.currentValue,
        summary: change.summary,
        detected_at: change.detectedAt.toISOString(),
        confidence: Number(change.confidence),
        review_status: change.reviewStatus,
        affects: change.affects,
      })),
      has_more: feed.length === limit,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/changes", "GET", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
