import { NextResponse } from "next/server";
import { z } from "zod";
import { listCapabilities } from "@railor/core";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  provider: z.string().max(100).optional(),
  product: z.string().max(40).optional(),
  entity_country: z.string().length(2).optional(),
  destination_country: z.string().length(2).optional(),
  destination_currency: z.string().length(3).optional(),
  asset: z.string().max(12).optional(),
  network: z.string().max(40).optional(),
  availability: z.enum(["supported", "partial", "unsupported", "unknown"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  starting_after: z.string().uuid().optional(),
  include_demo: z.enum(["true", "false"]).optional(),
});

/**
 * GET /v1/capabilities — the raw capability graph, one row per dimensioned
 * fact, each with its evidence. Cursor-paginated (`starting_after`, `has_more`).
 */
export async function GET(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const url = new URL(request.url);
    const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const q = parsed.data;
    const upper = (v?: string) => v?.toUpperCase();
    const { rows, hasMore } = await listCapabilities({
      provider: q.provider?.toLowerCase(),
      product: q.product,
      entityCountry: upper(q.entity_country),
      destinationCountry: upper(q.destination_country),
      destinationCurrency: upper(q.destination_currency),
      sourceAsset: upper(q.asset),
      sourceNetwork: q.network?.toLowerCase(),
      availability: q.availability,
      limit: q.limit,
      startingAfter: q.starting_after,
      includeDemo: q.include_demo === "true",
    });

    await recordUsage(context, "/v1/capabilities", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "list",
      request_id: context.requestId,
      has_more: hasMore,
      data: rows.map(({ capability: c, providerSlug, providerName, providerIsDemo, evidence: e }) => ({
        object: "capability",
        id: c.id,
        provider: { id: providerSlug, name: providerName, is_demo: providerIsDemo },
        product: c.product,
        entity_country: c.entityCountry,
        customer_country: c.customerCountry,
        customer_type: c.customerType,
        source_country: c.sourceCountry,
        source_asset: c.sourceAsset,
        source_network: c.sourceNetwork,
        source_currency: c.sourceCurrency,
        destination_country: c.destinationCountry,
        destination_currency: c.destinationCurrency,
        payment_method: c.paymentMethod,
        availability: c.availability,
        note: c.note,
        derivation: c.derivation,
        confidence: e ? Number(e.confidence) : null,
        last_verified_at: c.lastVerifiedAt?.toISOString() ?? null,
        evidence: e
          ? [{ type: e.sourceType, url: e.sourceUrl, title: e.sourceTitle, verified_at: e.lastVerifiedAt?.toISOString() ?? null }]
          : [],
      })),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/capabilities", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
