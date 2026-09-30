import { NextResponse } from "next/server";
import { loadProviderBySlug } from "@railor/core";
import { ApiError, authenticate, recordUsage, type ApiContext } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * GET /v1/providers/{slug} — one provider's full profile: products, coverage,
 * requirements, limits, verified fees and the sources behind them. Fees and
 * limits appear only when a source supports them; nothing is estimated.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const { id } = await params;
    const row = await loadProviderBySlug(decodeURIComponent(id).toLowerCase());
    if (!row) throw new ApiError(404, "provider_not_found", `No provider with slug "${id}".`);

    const evidenceById = new Map(row.facets.filter((f) => f.evidence).map((f) => [f.evidence!.id, f.evidence!]));
    const supported = row.facets.filter((f) => f.capability.availability === "supported");
    const body = {
      object: "provider",
      request_id: context.requestId,
      id: row.provider.slug,
      name: row.provider.name,
      category: row.provider.category,
      description: row.provider.description,
      is_demo: row.provider.isDemo,
      developer: {
        has_api: row.provider.hasApi,
        has_sandbox: row.provider.hasSandbox,
        has_webhooks: row.provider.hasWebhooks,
      },
      products: row.products.map((p) => ({ product: p.product, name: p.name })),
      coverage: {
        capability_rows: row.facets.length,
        supported_rows: supported.length,
        entity_countries: [...new Set(supported.map((f) => f.capability.entityCountry).filter(Boolean))],
        destination_countries: [...new Set(supported.map((f) => f.capability.destinationCountry).filter(Boolean))],
        destination_currencies: [...new Set(supported.map((f) => f.capability.destinationCurrency).filter(Boolean))],
        assets: [...new Set(supported.map((f) => f.capability.sourceAsset).filter(Boolean))],
        networks: [...new Set(supported.map((f) => f.capability.sourceNetwork).filter(Boolean))],
      },
      requirements: row.requirements.map((r) => ({
        key: r.key,
        label: r.label,
        kind: r.kind,
        mandatory: r.mandatory,
        entity_country: r.entityCountry,
        note: r.note,
        last_verified_at: iso(r.lastVerifiedAt),
      })),
      limits: row.limits
        .filter((l) => l.evidenceId)
        .map((l) => ({
          product: l.product,
          customer_type: l.customerType,
          currency: l.currency,
          min_amount: l.minAmount === null ? null : Number(l.minAmount),
          max_amount: l.maxAmount === null ? null : Number(l.maxAmount),
          daily_max: l.dailyMax === null ? null : Number(l.dailyMax),
          monthly_max: l.monthlyMax === null ? null : Number(l.monthlyMax),
          summary: l.summary,
          last_verified_at: iso(l.lastVerifiedAt),
        })),
      fees: row.fees
        .filter((f) => f.evidenceId)
        .map((f) => ({
          product: f.product,
          destination_currency: f.destinationCurrency,
          percent_bps: f.percentBps,
          fixed_amount: f.fixedAmount === null ? null : Number(f.fixedAmount),
          fixed_currency: f.fixedCurrency,
          fx_spread_bps: f.fxSpreadBps,
          summary: f.summary,
          last_verified_at: iso(f.lastVerifiedAt),
        })),
      evidence: [...evidenceById.values()].slice(0, 20).map((e) => ({
        type: e.sourceType,
        url: e.sourceUrl,
        title: e.sourceTitle,
        verified_at: iso(e.lastVerifiedAt),
        confidence: Number(e.confidence),
      })),
      recent_changes: row.changes.slice(0, 10).map((c) => ({
        kind: c.kind,
        summary: c.summary,
        detected_at: iso(c.detectedAt),
        review_status: c.reviewStatus,
      })),
      last_verified_at: iso(row.provider.lastVerifiedAt),
    };
    await recordUsage(context, "/v1/providers/{id}", "GET", 200, Date.now() - started);
    return NextResponse.json(body);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/providers/{id}", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
