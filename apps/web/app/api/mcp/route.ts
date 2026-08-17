import { NextResponse } from "next/server";
import {
  loadChangeFeed,
  loadProviderBySlug,
  loadProviderSummaries,
  loadReferenceData,
  searchCorridors,
} from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { ApiError, authenticate, camelQuery } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Railor MCP server — read-only.
 *
 * Speaks JSON-RPC 2.0 over HTTP so an agent (Claude Code, Cursor, an internal
 * treasury bot) can ask the same questions the UI asks. Every tool result
 * carries `source`, `verified_at` and `confidence`: an agent must be able to
 * tell a sourced fact from a guess, and Railor never returns the second.
 */

const TOOLS = [
  {
    name: "search_corridors",
    description:
      "Evaluate every mapped provider against a corridor (entity jurisdiction, asset, network, destination country/currency, rail). Returns a verdict, reason, confidence and evidence per provider.",
    inputSchema: {
      type: "object",
      properties: {
        entity_country: { type: "string", description: "ISO 3166-1 alpha-2 of the incorporating jurisdiction" },
        customer_type: { type: "string", enum: ["business", "individual"] },
        asset: { type: "string", description: "Stablecoin symbol, e.g. USDC" },
        network: { type: "string", description: "Blockchain slug, e.g. base" },
        destination_country: { type: "string" },
        destination_currency: { type: "string" },
        payment_method: { type: "string" },
        amount: { type: "number" },
      },
    },
  },
  {
    name: "check_eligibility",
    description:
      "Check whether one named provider can serve a corridor, and explain precisely why or why not.",
    inputSchema: {
      type: "object",
      required: ["provider"],
      properties: {
        provider: { type: "string", description: "Provider slug" },
        entity_country: { type: "string" },
        customer_type: { type: "string" },
        asset: { type: "string" },
        network: { type: "string" },
        destination_country: { type: "string" },
        destination_currency: { type: "string" },
      },
    },
  },
  {
    name: "search_providers",
    description: "List mapped providers, optionally filtered by product, asset or network.",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string" },
        asset: { type: "string" },
        network: { type: "string" },
      },
    },
  },
  {
    name: "compare_providers",
    description: "Compare 2–4 providers across coverage, products, requirements and freshness.",
    inputSchema: {
      type: "object",
      required: ["providers"],
      properties: { providers: { type: "array", items: { type: "string" } } },
    },
  },
  {
    name: "get_provider_capabilities",
    description: "Full normalized capability set for one provider, with evidence per claim.",
    inputSchema: {
      type: "object",
      required: ["provider"],
      properties: { provider: { type: "string" } },
    },
  },
  {
    name: "get_provider_changes",
    description: "Detected changes for a provider, newest first, with review status.",
    inputSchema: {
      type: "object",
      properties: { provider: { type: "string" }, limit: { type: "number" } },
    },
  },
  {
    name: "get_kyb_requirements",
    description: "Normalized KYC/KYB requirements a provider publishes for onboarding.",
    inputSchema: {
      type: "object",
      required: ["provider"],
      properties: { provider: { type: "string" }, entity_country: { type: "string" } },
    },
  },
  {
    name: "get_supported_countries",
    description: "Countries indexed by Railor, with the providers that reach them.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_supported_currencies",
    description: "Fiat currencies and stablecoins indexed by Railor.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

type ToolName = (typeof TOOLS)[number]["name"];

async function callTool(name: ToolName, args: Record<string, unknown>) {
  switch (name) {
    case "search_corridors": {
      const query = CorridorQuery.parse(camelQuery(args));
      const result = await searchCorridors(query);
      return {
        query,
        providers_checked: result.providersChecked,
        counts: result.counts,
        results: result.results.map((r) => ({
          provider: r.provider.slug,
          name: r.provider.name,
          eligibility: r.eligibility,
          reason: r.reasons[0]?.message ?? null,
          also_true: r.reasons.flatMap((x) => x.alsoTrue),
          would_change: r.reasons.flatMap((x) => x.wouldChange),
          confidence: r.confidence,
          verified_at: r.lastVerifiedAt?.toISOString() ?? null,
          source: r.evidence[0]?.sourceUrl ?? null,
          source_type: r.evidence[0]?.sourceType ?? null,
        })),
      };
    }

    case "check_eligibility": {
      const slug = String(args.provider ?? "");
      const query = CorridorQuery.parse(camelQuery(args));
      const result = await searchCorridors(query);
      const match = result.results.find((r) => r.provider.slug === slug);
      if (!match) {
        return { provider: slug, eligibility: "unknown", reason: "Provider not found in Railor." };
      }
      return {
        provider: slug,
        eligibility: match.eligibility,
        reasons: match.reasons,
        confidence: match.confidence,
        verified_at: match.lastVerifiedAt?.toISOString() ?? null,
        evidence: match.evidence.map((e) => ({
          source: e.sourceUrl,
          source_type: e.sourceType,
          verified_at: e.lastVerifiedAt,
          confidence: e.confidence,
        })),
      };
    }

    case "search_providers": {
      let providers = await loadProviderSummaries();
      if (args.product) providers = providers.filter((p) => p.products.includes(String(args.product)));
      if (args.asset) providers = providers.filter((p) => p.assets.includes(String(args.asset)));
      if (args.network) providers = providers.filter((p) => p.networks.includes(String(args.network)));
      return {
        providers: providers.map((p) => ({
          slug: p.slug,
          name: p.name,
          category: p.category,
          products: p.products,
          assets: p.assets,
          networks: p.networks,
          verified_at: p.lastVerifiedAt?.toISOString() ?? null,
          is_demo_dataset: p.isDemo,
        })),
      };
    }

    case "compare_providers": {
      const slugs = (args.providers as string[]).slice(0, 4);
      const rows = await Promise.all(slugs.map((slug) => loadProviderBySlug(slug)));
      return {
        providers: rows.filter(Boolean).map((row) => ({
          slug: row!.provider.slug,
          name: row!.provider.name,
          products: row!.products.map((p) => p.product),
          entity_countries_supported: [
            ...new Set(
              row!.facets
                .filter((f) => f.capability.entityCountry && f.capability.availability === "supported")
                .map((f) => f.capability.entityCountry),
            ),
          ],
          destinations: [
            ...new Set(
              row!.facets
                .filter((f) => f.capability.destinationCountry)
                .map((f) => `${f.capability.destinationCountry}:${f.capability.destinationCurrency}`),
            ),
          ],
          requirements: row!.requirements.map((r) => r.key),
          has_api: row!.provider.hasApi,
          has_sandbox: row!.provider.hasSandbox,
          verified_at: row!.provider.lastVerifiedAt?.toISOString() ?? null,
        })),
      };
    }

    case "get_provider_capabilities": {
      const row = await loadProviderBySlug(String(args.provider ?? ""));
      if (!row) return { error: "provider_not_found" };
      return {
        provider: row.provider.slug,
        capabilities: row.facets.map((f) => ({
          product: f.capability.product,
          entity_country: f.capability.entityCountry,
          customer_type: f.capability.customerType,
          asset: f.capability.sourceAsset,
          network: f.capability.sourceNetwork,
          destination_country: f.capability.destinationCountry,
          destination_currency: f.capability.destinationCurrency,
          payment_method: f.capability.paymentMethod,
          availability: f.capability.availability,
          note: f.capability.note,
          verified_at: f.capability.lastVerifiedAt?.toISOString() ?? null,
          source: f.evidence?.sourceUrl ?? null,
          confidence: f.evidence ? Number(f.evidence.confidence) : null,
        })),
      };
    }

    case "get_provider_changes": {
      const feed = await loadChangeFeed({
        providerSlugs: args.provider ? [String(args.provider)] : undefined,
        limit: Number(args.limit ?? 20),
      });
      return {
        changes: feed.map(({ change, providerSlug }) => ({
          provider: providerSlug,
          kind: change.kind,
          field: change.field,
          previous_value: change.previousValue,
          current_value: change.currentValue,
          summary: change.summary,
          detected_at: change.detectedAt.toISOString(),
          confidence: Number(change.confidence),
          review_status: change.reviewStatus,
        })),
      };
    }

    case "get_kyb_requirements": {
      const row = await loadProviderBySlug(String(args.provider ?? ""));
      if (!row) return { error: "provider_not_found" };
      const entity = args.entity_country ? String(args.entity_country) : null;
      return {
        provider: row.provider.slug,
        requirements: row.requirements
          .filter((r) => !entity || !r.entityCountry || r.entityCountry === entity)
          .map((r) => ({
            key: r.key,
            label: r.label,
            kind: r.kind,
            mandatory: r.mandatory,
            note: r.note,
            entity_country: r.entityCountry,
            verified_at: r.lastVerifiedAt?.toISOString() ?? null,
          })),
      };
    }

    case "get_supported_countries": {
      const { countries } = await loadReferenceData();
      return { countries: countries.map((c) => ({ code: c.code, name: c.name, region: c.region })) };
    }

    case "get_supported_currencies": {
      const { currencies, assets } = await loadReferenceData();
      return {
        fiat: currencies.map((c) => ({ code: c.code, name: c.name })),
        stablecoins: assets.map((a) => ({ symbol: a.symbol, name: a.name, pegged_to: a.peggedTo })),
      };
    }

    default:
      return { error: "unknown_tool" };
  }
}

export async function POST(request: Request) {
  let body: { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const respond = (result: unknown) =>
    NextResponse.json({ jsonrpc: "2.0", id: body.id ?? null, result });

  if (body.method === "initialize") {
    return respond({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "railor", version: "0.1.0" },
      instructions:
        "Railor exposes verified financial-infrastructure capability data. Every result carries source, verified_at and confidence. Treat a missing value as unknown — Railor does not infer capability.",
    });
  }

  if (body.method === "notifications/initialized") {
    return new NextResponse(null, { status: 204 });
  }

  if (body.method === "tools/list") {
    return respond({ tools: TOOLS });
  }

  if (body.method === "tools/call") {
    try {
      await authenticate(request);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 401;
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32001, message: (error as Error).message },
        },
        { status },
      );
    }

    const name = body.params?.name as ToolName | undefined;
    const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
    if (!name || !TOOLS.some((t) => t.name === name)) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32602, message: "Unknown tool" } },
        { status: 400 },
      );
    }

    const result = await callTool(name, args);
    return respond({
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: false,
    });
  }

  return NextResponse.json(
    { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: "Method not found" } },
    { status: 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    name: "railor",
    transport: "http",
    tools: TOOLS.map((t) => t.name),
    docs: "/docs/mcp",
  });
}
