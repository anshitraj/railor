import "server-only";
import { createHash } from "node:crypto";
import { getAdapter, type PlatformQuoteCheck, type QuoteRequest, type UnifiedQuote } from "@railor/core";
import { consumeLimit } from "./rate-limit";

/** Railor-owned credentials only. Never reused for a customer's connection or execution. */
function configuration(): { environment: "sandbox" | "production"; clientId: string; apiKey: string } | null {
  const environment = process.env.AIRWALLEX_PLATFORM_ENVIRONMENT?.trim() || "sandbox";
  if (environment !== "sandbox" && environment !== "production") return null;
  const clientId = environment === "production" ? process.env.AIRWALLEX_PLATFORM_CLIENT_ID
    : process.env.AIRWALLEX_SANDBOX_CLIENT_ID || process.env.airwallex_sandbox_client_id;
  const apiKey = environment === "production" ? process.env.AIRWALLEX_PLATFORM_API_KEY
    : process.env.AIRWALLEX_SANDBOX_API_KEY || process.env.airwallex_sandbox_scoped_api;
  if (!clientId?.trim() || !apiKey?.trim()) return null;
  return { environment, clientId: clientId.trim(), apiKey: apiKey.trim() };
}

export function platformQuoteProviders(): string[] {
  return configuration()?.environment === "production" ? ["airwallex"] : [];
}

const cache = new Map<string, { until: number; value: Promise<PlatformQuoteCheck> }>();

/** Sanitized observation; account IDs, executable quote IDs and secrets never leave the server. */
export async function getPlatformQuoteCheck(request: QuoteRequest): Promise<PlatformQuoteCheck | null> {
  const credentials = configuration();
  if (!credentials || (credentials.environment === "sandbox" && process.env.NODE_ENV === "production" && process.env.RAILOR_SHOW_SANDBOX_QUOTES !== "true")) return null;
  const key = createHash("sha256").update(JSON.stringify([credentials, request])).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const base = { providerSlug: "airwallex", providerName: "Airwallex", environment: credentials.environment } as const;
  const value = (async (): Promise<PlatformQuoteCheck> => {
    try {
      if (!Number.isFinite(request.amount) || request.amount <= 0 || request.amount > 10_000_000) throw new Error("invalid_amount");
      // Shared, atomic provider budget also covers server-rendered page requests.
      // Cache hits consume neither a database bucket nor another provider call.
      if (!await consumeLimit("platform-fx", `airwallex:${credentials.environment}`, 60, 60000)) throw new Error("platform_quote_budget");
      const adapter = getAdapter("airwallex");
      const q = await adapter!.getQuote!(credentials, request);
      const observed = Date.parse(q.observedAt);
      const expiry = q.expiresAt ? Date.parse(q.expiresAt) : null;
      if (q.providerSlug !== "airwallex" || q.sourceAsset !== request.sourceAsset || q.destinationCurrency !== request.destinationCurrency || q.amount !== request.amount
        || (q.sourceNetwork ?? null) !== (request.sourceNetwork ?? null)
        || (q.destinationCountry && q.destinationCountry !== request.destinationCountry)
        || !Number.isFinite(observed) || observed > Date.now() + 60000 || observed < Date.now() - 60000
        || (expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now()))
        || (q.recipientAmount !== undefined && (!Number.isFinite(q.recipientAmount) || q.recipientAmount < 0))
        || (q.exchangeRate !== undefined && (!Number.isFinite(Number(q.exchangeRate)) || Number(q.exchangeRate) <= 0))) throw new Error("invalid_quote");
      const quote: UnifiedQuote = {
        providerSlug: "airwallex", ...request, recipientAmount: q.recipientAmount,
        exchangeRate: q.exchangeRate, costPartial: true, quoteType: "indicative", accountContext: "railor_network",
        verificationType: "provider_reported", observedAt: q.observedAt, quotedAt: q.quotedAt, expiresAt: q.expiresAt,
      };
      // Never let a cached response outlive the provider's quoted validity.
      const entry = cache.get(key);
      if (entry && expiry !== null) entry.until = Math.min(entry.until, expiry);
      return { ...base, status: "quoted", quote, error: null };
    } catch {
      return { ...base, status: "unavailable", quote: null, error: "Airwallex could not return an FX quote for this request. Check the account's currency access and quote permissions." };
    }
  })();
  cache.set(key, { until: Date.now() + 15000, value });
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return value;
}

/** Search can use production reference pricing, but never sandbox/customer-live pricing. */
export async function fetchPlatformReferenceQuote(slug: string, request: QuoteRequest): Promise<UnifiedQuote | null> {
  if (slug !== "airwallex" || configuration()?.environment !== "production") return null;
  return (await getPlatformQuoteCheck(request))?.quote ?? null;
}
