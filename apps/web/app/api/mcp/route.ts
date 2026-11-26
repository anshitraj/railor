import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CustomerContext,
  loadChangeFeed,
  loadProviderBySlug,
  loadProviderSummaries,
  loadReferenceData,
  searchCorridors,
} from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { ApiError, authenticate, camelQuery, type ApiContext } from "../../../lib/api-auth";
import { keyForAccessToken, OAUTH_SCOPE, protectedResourceMetadataUrl, TOKEN_PREFIX } from "../../../lib/oauth-server";
import { runPriceCheck } from "../../../lib/pricing";
import { camelTop } from "../../../lib/v1";
import { chargeWalletUsage } from "../../../lib/wallet";
import { indiaExchangeQuotes } from "../../../lib/india-exchange-quotes";
import { stablecoinCashOutQuote } from "../../../lib/stablecoin-cash-out-quotes";
import { NETWORKS, isCashOutCurrency, networksFor, stablecoinRoutes, type Network, type Stablecoin } from "../../../lib/stablecoin-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Railor MCP server — read-only.
 *
 * Speaks JSON-RPC 2.0 over Streamable HTTP (JSON responses, no SSE) so an
 * agent (Claude Code, Cursor, an internal treasury bot) can ask the same
 * questions the UI asks. Every tool result carries its source and when it was
 * observed: an agent must be able to tell a sourced fact from a guess, and
 * Railor never returns the second.
 */

/** Newest first. The client's version is echoed when supported; otherwise the newest. */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_VERSION = "0.2.0";

const CONTEXT_SCHEMA = {
  type: "object",
  description: "Who receives or sends. Without it prices are unscoped references, not eligible products.",
  properties: {
    profile: { type: "string", enum: ["business", "freelancer", "sole_proprietor", "personal"] },
    country: { type: "string", description: "ISO 3166-1 alpha-2 of the account holder, e.g. IN" },
    direction: { type: "string", enum: ["send", "receive"] },
    purpose: { type: "string", enum: ["services", "goods", "salary", "personal"] },
    payment_method: { type: "string", enum: ["local_bank", "wire", "card", "transfer_service"], description: "How the payer funds it, when receiving" },
  },
  required: ["profile", "country", "direction", "purpose"],
} as const;

const TOOLS = [
  {
    name: "compare_prices",
    description:
      "Compare what arrives through each provider for an amount, e.g. USD 1,700 to INR. Each row says what kind of number it is (exact account quote, live public quote, published fee schedule or market estimate), what it costs against the mid-market rate, what is still unknown, and its source.",
    inputSchema: {
      type: "object",
      required: ["source_currency", "destination_currency", "amount"],
      properties: {
        source_currency: { type: "string", description: "ISO 4217, e.g. USD" },
        destination_currency: { type: "string", description: "ISO 4217, e.g. INR" },
        amount: { type: "number", description: "Amount in the source currency" },
        destination_country: { type: "string", description: "ISO 3166-1 alpha-2, when the currency is used in several countries" },
        include_market: { type: "boolean", description: "Also include dated consumer price observations" },
        context: CONTEXT_SCHEMA,
      },
    },
  },
  {
    name: "stablecoin_offramps",
    description:
      "Ways to turn USDT or USDC on a given network into money in a bank: Indian exchanges with live sell prices after their published fees and 1% TDS, plus collection and issuer routes. Railor never treats a stablecoin as 1 USD.",
    inputSchema: {
      type: "object",
      required: ["asset", "network", "amount"],
      properties: {
        asset: { type: "string", enum: ["USDT", "USDC"] },
        network: { type: "string", description: `One of: ${Object.keys(NETWORKS).join(", ")}` },
        amount: { type: "number", description: "Amount of the stablecoin" },
        destination: { type: "string", description: "Bank currency, default INR" },
      },
    },
  },
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

const PriceArgs = z.object({
  sourceCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "source_currency must be a 3-letter code"),
  destinationCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "destination_currency must be a 3-letter code"),
  destinationCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  amount: z.coerce.number().positive("amount must be above zero").max(10_000_000),
  includeMarket: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/** A tool answer an agent should treat as an error (isError: true) rather than data. */
class ToolError extends Error {}

async function callTool(name: ToolName, args: Record<string, unknown>, ctx: ApiContext) {
  switch (name) {
    case "compare_prices": {
      const parsed = PriceArgs.safeParse(camelTop(args));
      if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Check the arguments.");
      const { context: rawContext, ...rest } = parsed.data;
      const context = rawContext ? CustomerContext.safeParse(camelTop(rawContext)) : null;
      if (context && !context.success) throw new ToolError(`context: ${context.error.issues[0]?.message ?? "check the fields"}`);
      if (rest.sourceCurrency === rest.destinationCurrency) throw new ToolError("Pick two different currencies.");
      const result = await runPriceCheck(ctx.organizationId, { ...rest, ...(context?.success ? { context: context.data } : {}) });
      return {
        source_currency: result.input.sourceCurrency,
        destination_currency: result.input.destinationCurrency,
        amount: result.input.amount,
        destination_country: result.input.destinationCountry ?? null,
        scope: context?.success ? "profile_specific" : "unscoped_reference",
        reference: result.reference ? { rate: result.reference.rate, source: result.reference.source, observed_at: result.reference.observedAt } : null,
        prices: result.rows.map((r) => ({
          provider: r.providerSlug,
          provider_name: r.providerName,
          product: r.product?.label ?? null,
          basis: r.basis,
          recipient_amount: r.recipientAmount,
          fee_amount: r.feeAmount,
          fee_currency: r.feeCurrency,
          rate: r.rate,
          total_cost_pct: r.totalCostPct,
          cost_complete: !r.partial,
          missing: r.missing ?? [],
          side: r.side ?? null,
          tax_included: r.taxNote ?? r.taxIncluded ?? null,
          receipt: r.receipt ?? null,
          eligibility: r.profileAssessment?.status ?? null,
          delivery: r.delivery,
          observed_at: r.observedAt || null,
          source: r.source,
        })),
        unavailable: result.unavailable.map((u) => ({ provider: u.providerSlug, provider_name: u.providerName, reason: u.reason })),
        generated_at: result.generatedAt,
      };
    }

    case "stablecoin_offramps": {
      const asset = String(args.asset ?? "").toUpperCase();
      const network = String(args.network ?? "").toLowerCase();
      const amount = Number(args.amount);
      const destination = String(args.destination ?? "INR").toUpperCase();
      if (asset !== "USDT" && asset !== "USDC") throw new ToolError("asset must be USDT or USDC.");
      if (!Object.hasOwn(NETWORKS, network)) throw new ToolError(`network must be one of: ${Object.keys(NETWORKS).join(", ")}.`);
      if (!networksFor(asset as Stablecoin).includes(network as Network)) throw new ToolError(`${asset} isn't issued on ${network}. Try: ${networksFor(asset as Stablecoin).join(", ")}.`);
      if (!(amount > 0) || amount > 10_000_000) throw new ToolError("amount must be above zero.");
      if (destination !== "INR" && !isCashOutCurrency(destination)) throw new ToolError("destination must be INR or a supported bank currency.");
      const routes = stablecoinRoutes(asset as Stablecoin, network as Network, destination as Parameters<typeof stablecoinRoutes>[2], amount);
      if (destination === "INR") {
        const { quotes, reference } = await indiaExchangeQuotes(asset as Stablecoin, network as Network, amount);
        return { asset, network, amount, destination, reference, exchanges: quotes, other_routes: routes };
      }
      return { asset, network, amount, destination, cash_out: await stablecoinCashOutQuote(asset as Stablecoin, network as Network, destination as Parameters<typeof stablecoinCashOutQuote>[2], amount), other_routes: routes };
    }

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
        if (!(await loadProviderBySlug(slug))) throw new ToolError(`No provider "${slug}" in Railor. Use search_providers to find its slug.`);
        return { provider: slug, eligibility: "unknown", reason: "Railor has no mapped capability for this provider on this corridor." };
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
      if (!row) throw new ToolError(`No provider "${String(args.provider ?? "")}" in Railor. Use search_providers to find its slug.`);
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
      if (!row) throw new ToolError(`No provider "${String(args.provider ?? "")}" in Railor. Use search_providers to find its slug.`);
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
      throw new ToolError("Unknown tool.");
  }
}

type JsonRpcId = number | string | null;
type JsonRpcMessage = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

const rpcResult = (id: JsonRpcId, result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result });
const rpcError = (id: JsonRpcId, code: number, message: string, status = 200, headers?: HeadersInit) =>
  NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers });
const toolText = (value: unknown, isError: boolean) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], isError });

/**
 * The WWW-Authenticate challenge. `resource_metadata` points a chat app at the
 * OAuth discovery document (RFC 9728), which is how ChatGPT and Claude learn
 * they can sign in instead of pasting a key.
 */
function bearerChallenge(error?: string) {
  let metadata = "";
  try { metadata = `, resource_metadata="${protectedResourceMetadataUrl()}"`; } catch { /* APP_ORIGIN unset: the key flow still works */ }
  return `Bearer realm="railor"${error ? `, error="${error}"` : ""}${metadata}, scope="${OAUTH_SCOPE}"`;
}

/** Every request needs credentials: a key, or an OAuth token that is still live. Otherwise the client is told how to sign in. */
async function challenge(request: Request, id: JsonRpcId): Promise<NextResponse | null> {
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return rpcError(id, -32001, "Sign in to Railor, or send an API key as `Authorization: Bearer rail_…`.", 401, { "WWW-Authenticate": bearerChallenge() });
  if (presented.startsWith(TOKEN_PREFIX) && !(await keyForAccessToken(presented))) {
    return rpcError(id, -32001, "That access token has expired or was revoked. Reconnect the app.", 401, { "WWW-Authenticate": bearerChallenge("invalid_token") });
  }
  return null;
}


/** Tool calls are metered against the workspace wallet once `api_request` has a price (free until then). */
async function handleToolCall(request: Request, message: JsonRpcMessage) {
  const id = message.id ?? null;
  let ctx: ApiContext;
  try {
    ctx = await authenticate(request, { oauth: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 401;
    return rpcError(id, -32001, (error as Error).message, status, status === 401 ? { "WWW-Authenticate": bearerChallenge("invalid_token") } : undefined);
  }
  const name = message.params?.name as ToolName | undefined;
  const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
  if (!name || !TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${String(name)}`);

  const charge = await chargeWalletUsage(ctx.organizationId, "api_request", { idempotencyKey: ctx.requestId });
  if (!charge.charged && charge.reason === "insufficient_balance") {
    return rpcResult(id, toolText("Your Railor wallet balance is too low for this call. Add credit on the Wallet page and try again.", true));
  }

  try {
    return rpcResult(id, toolText(await callTool(name, args, ctx), false));
  } catch (error) {
    if (error instanceof ToolError) return rpcResult(id, toolText(error.message, true));
    console.error(JSON.stringify({ event: "mcp_tool_failed", tool: name, requestId: ctx.requestId, errorType: error instanceof Error ? error.name : "UnknownError" }));
    return rpcResult(id, toolText(`Railor could not complete ${name}. Try again shortly.`, true));
  }
}

export async function POST(request: Request) {
  let message: JsonRpcMessage;
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) return rpcError(null, -32600, "Send one JSON-RPC request per POST.", 400);
  const id = message.id ?? null;

  // A notification or a response from the client: acknowledged, nothing to return.
  if (message.id === undefined || message.method === undefined) return new NextResponse(null, { status: 202 });
  const denied = await challenge(request, id);
  if (denied) return denied;

  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? "");
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "railor", title: "Railor", version: SERVER_VERSION },
        instructions:
          "Railor compares cross-border payment prices and maps provider capabilities. Every result carries its source and when it was observed. Treat a missing value as unknown: Railor does not infer prices or capability. Use compare_prices for 'how much arrives', stablecoin_offramps for USDT/USDC to a bank, and the catalog tools for eligibility and requirements.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call":
      return handleToolCall(request, message);
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

/** No server-initiated stream: a client asking for SSE is told to POST instead, as the spec allows. */
export async function GET(request: Request) {
  if ((request.headers.get("accept") ?? "").includes("text/event-stream")) {
    return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
  }
  return NextResponse.json({
    name: "railor",
    version: SERVER_VERSION,
    transport: "streamable-http",
    protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
    tools: TOOLS.map((t) => t.name),
    docs: "/docs/mcp",
  });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
