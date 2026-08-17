import { NextResponse } from "next/server";
import { loadProviderSummaries } from "@railor/core";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/providers — cursor-free list of mapped providers with freshness. */
export async function GET(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const url = new URL(request.url);
    const product = url.searchParams.get("product");
    const country = url.searchParams.get("country");

    let providers = await loadProviderSummaries();
    if (product) providers = providers.filter((p) => p.products.includes(product));
    if (country)
      providers = providers.filter((p) => p.headquartersCountry === country.toUpperCase());

    await recordUsage(context, "/v1/providers", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "list",
      request_id: context.requestId,
      data: providers.map((p) => ({
        object: "provider",
        ...snake({
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          isDemo: p.isDemo,
          products: p.products,
          assets: p.assets,
          networks: p.networks,
          countryCount: p.countryCount,
          currencyCount: p.currencyCount,
          customerTypes: p.customerTypes,
          hasApi: p.hasApi,
          hasSandbox: p.hasSandbox,
          hasWebhooks: p.hasWebhooks,
          lastVerifiedAt: p.lastVerifiedAt,
        }),
      })),
      has_more: false,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/providers", "GET", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
