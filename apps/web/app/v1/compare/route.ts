import { NextResponse } from "next/server";
import { z } from "zod";
import { loadProviderBySlug } from "@railor/core";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  providers: z.array(z.string().min(1).max(100)).min(2).max(4),
  only_differences: z.boolean().optional(),
});

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * POST /v1/compare — 2–4 providers side by side on the same dimensions.
 * `only_differences` drops dimensions where every provider agrees.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Send `providers`: an array of 2–4 provider slugs.");

    const slugs = [...new Set(parsed.data.providers.map((s) => s.toLowerCase()))];
    const rows = await Promise.all(slugs.map((slug) => loadProviderBySlug(slug)));
    const missing = slugs.filter((_, i) => !rows[i]);
    if (missing.length) throw new ApiError(404, "provider_not_found", `Unknown provider(s): ${missing.join(", ")}.`);

    const profiles = rows.map((row) => {
      const r = row!;
      const supported = r.facets.filter((f) => f.capability.availability === "supported");
      const set = (values: Array<string | null>) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
      return {
        id: r.provider.slug,
        name: r.provider.name,
        dimensions: {
          products: set(r.products.map((p) => p.product)),
          entity_countries: set(supported.map((f) => f.capability.entityCountry)),
          destination_countries: set(supported.map((f) => f.capability.destinationCountry)),
          destination_currencies: set(supported.map((f) => f.capability.destinationCurrency)),
          assets: set(supported.map((f) => f.capability.sourceAsset)),
          networks: set(supported.map((f) => f.capability.sourceNetwork)),
          customer_types: set(supported.map((f) => f.capability.customerType)),
          requirements: set(r.requirements.filter((q) => q.mandatory).map((q) => q.key)),
          has_api: r.provider.hasApi,
          has_sandbox: r.provider.hasSandbox,
          has_webhooks: r.provider.hasWebhooks,
        } as Record<string, unknown>,
        evidence_count: new Set(r.facets.map((f) => f.evidence?.id).filter(Boolean)).size,
        last_verified_at: iso(r.provider.lastVerifiedAt),
      };
    });

    const keys = Object.keys(profiles[0]!.dimensions);
    const differing = keys.filter((key) => new Set(profiles.map((p) => JSON.stringify(p.dimensions[key]))).size > 1);
    const shown = parsed.data.only_differences ? differing : keys;

    await recordUsage(context, "/v1/compare", "POST", 200, Date.now() - started);
    return NextResponse.json({
      object: "comparison",
      request_id: context.requestId,
      dimensions: shown,
      differing_dimensions: differing,
      providers: profiles.map((p) => ({
        ...p,
        dimensions: Object.fromEntries(shown.map((k) => [k, p.dimensions[k]])),
      })),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/compare", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
