import { NextResponse } from "next/server";
import { z } from "zod";
import { RankingPreset } from "@railor/types";
import { loadProviderInputs, routeQuote } from "@railor/core";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../lib/api-auth";
import { getConnectableProviders, getConnectionCredentials } from "../../../lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  source_asset: z.string(),
  source_network: z.string().optional(),
  destination_currency: z.string(),
  destination_country: z.string().optional(),
  amount: z.number().positive(),
  preset: RankingPreset.optional(),
});

/**
 * POST /v1/quote
 *
 * Failover + intelligent routing, live: asks every connected, quote-capable
 * provider for a real quote in parallel, tolerates individual failures, and
 * returns the winner ranked by `preset` plus a full attempt log — who was
 * asked, who was skipped and why, who failed and why. Not a fan-out of
 * fabricated numbers: a provider with no adapter or no connection is
 * reported as skipped, never silently priced.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
    }
    const {
      source_asset: sourceAsset,
      source_network: sourceNetwork,
      destination_currency: destinationCurrency,
      destination_country: destinationCountry,
      amount,
      preset,
    } = parsed.data;

    const [rows, providerInputs] = await Promise.all([
      getConnectableProviders(context.organizationId),
      loadProviderInputs(),
    ]);
    const healthBySlug = new Map(providerInputs.map((p) => [p.slug, p.healthOkRatio]));
    const providers = await Promise.all(
      rows.map(async ({ provider, connection, adapter }) => ({
        slug: provider.slug,
        name: provider.name,
        adapter,
        credentials: connection ? await getConnectionCredentials(context!.organizationId, provider.id) : null,
        healthOkRatio: healthBySlug.get(provider.slug) ?? null,
      })),
    );

    const result = await routeQuote(
      providers,
      { sourceAsset, sourceNetwork, destinationCurrency, destinationCountry, amount },
      preset ?? "balanced",
    );

    const payload = {
      object: "quote_routing_result",
      request_id: context.requestId,
      preset: result.preset,
      selected: result.selected ? snake(result.selected as unknown as Record<string, unknown>) : null,
      attempts: result.attempts.map((a) => snake(a as unknown as Record<string, unknown>)),
      ranking_confidence: result.rankingConfidence,
      ranking_inputs_used: result.rankingInputsUsed,
      ranking_inputs_missing: result.rankingInputsMissing,
      generated_at: new Date().toISOString(),
    };

    await recordUsage(context, "/v1/quote", "POST", 200, Date.now() - started);
    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/quote", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
