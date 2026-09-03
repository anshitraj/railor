import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { evidence as evidenceTable, getDb } from "@railor/database";
import { loadDecision } from "@railor/core";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /v1/decisions/{id}/evidence — every evidence row any candidate's eligibility/route facts depended on at decision time, deduped. Reads today's evidence rows by the ids the Decision recorded — the ids are the durable reference; if a row has since been superseded, this still returns what it looked like far enough to be useful, not a silently-updated fact. */
export async function GET(request: Request, { params }: Params) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const loaded = await loadDecision(context.organizationId, id);
    if (!loaded) throw new ApiError(404, "decision_not_found", "No decision with that id for this organization.");

    const evidenceIds = [...new Set(loaded.candidates.flatMap((c) => c.evidenceIds))];
    const rows = evidenceIds.length
      ? await (await getDb()).select().from(evidenceTable).where(inArray(evidenceTable.id, evidenceIds))
      : [];

    await recordUsage(context, "/v1/decisions/:id/evidence", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "decision_evidence",
      request_id: context.requestId,
      decision_id: id,
      data: rows.map((r) => snake(r as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/decisions/:id/evidence", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
