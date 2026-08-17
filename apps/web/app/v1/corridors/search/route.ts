import { NextResponse } from "next/server";
import { searchCorridors } from "@railor/core";
import { CorridorQuery, RankingPreset } from "@railor/types";
import {
  ApiError,
  authenticate,
  camelQuery,
  recordUsage,
  snake,
  type ApiContext,
} from "../../../../lib/api-auth";
import { getSatisfiedRequirements } from "../../../../lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/corridors/search
 *
 * The same code path the UI uses. Every result carries eligibility, the reason
 * behind it, confidence, last_verified_at and the evidence it rests on.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const preset = RankingPreset.optional().parse(body.preset);
    const query = CorridorQuery.parse(camelQuery(body));

    const satisfied = await getSatisfiedRequirements(context.organizationId);
    const result = await searchCorridors(query, { preset, satisfiedRequirements: satisfied });

    const payload = {
      object: "corridor_search",
      request_id: context.requestId,
      query: snake(query),
      preset: result.preset,
      providers_checked: result.providersChecked,
      counts: result.counts,
      data: result.results.map((r) => ({
        object: "provider_result",
        provider: r.provider,
        eligibility: r.eligibility,
        confidence: r.confidence,
        confidence_band: r.band,
        last_verified_at: r.lastVerifiedAt?.toISOString() ?? null,
        reasons: r.reasons.map((reason) => snake(reason as unknown as Record<string, unknown>)),
        outstanding_requirements: r.outstandingRequirements,
        facts: snake(r.facts as Record<string, unknown>),
        evidence: r.evidence.map((e) => snake(e as unknown as Record<string, unknown>)),
        score: r.score,
      })),
      has_more: false,
      generated_at: result.generatedAt.toISOString(),
    };

    await recordUsage(context, "/v1/corridors/search", "POST", 200, Date.now() - started);
    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/corridors/search", "POST", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
