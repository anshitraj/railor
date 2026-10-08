import type { ConnectionTestResult, ProviderAdapter } from "../../adapters.js";
import type { QuoteRequest, UnifiedQuote } from "../../unified.js";

// https://docs.xflowpay.com/exports/latest/api — the key selects test/live mode.
const BASE = "https://api.xflowpay.com";

function keyFor(credentials: Record<string, string>) {
  const key = credentials.apiKey?.trim();
  if (!key) throw new Error("Xflow secret API key is required.");
  const expected = credentials.environment === "production" ? "sk_live_" : "sk_test_";
  if (!key.startsWith(expected)) throw new Error(`Xflow ${credentials.environment === "production" ? "production" : "sandbox"} requires a ${expected} key.`);
  return key;
}

function headers(credentials: Record<string, string>) {
  const accountId = credentials.accountId?.trim();
  return {
    Authorization: `Bearer ${keyFor(credentials)}`,
    ...(accountId ? { "Xflow-Account": accountId } : {}),
  };
}

function amount(value: unknown, label: string) {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Xflow returned an invalid ${label}.`);
  return n;
}

export function xflowQuoteToUnified(body: Record<string, unknown>, request: QuoteRequest, now = new Date()): UnifiedQuote {
  const sell = body.sell as Record<string, unknown> | undefined;
  const buy = body.buy as Record<string, unknown> | undefined;
  const rate = body.rate as Record<string, unknown> | undefined;
  if (body.type !== "payout_fx" || sell?.currency !== request.sourceAsset.toUpperCase() || buy?.currency !== "INR") {
    throw new Error("Xflow returned a quote for a different route.");
  }
  const sold = amount(sell.amount, "source amount");
  if (Math.abs(sold - request.amount) > 0.01) throw new Error("Xflow returned a quote for a different amount.");
  const received = amount(buy.amount, "recipient amount");
  const userRate = amount(rate?.user, "customer FX rate");
  const validTo = typeof rate?.valid_to === "number" ? new Date(rate.valid_to * 1000).toISOString() : undefined;
  return {
    providerSlug: "xflow", sourceAsset: request.sourceAsset, sourceNetwork: request.sourceNetwork,
    destinationCurrency: "INR", destinationCountry: "IN", amount: request.amount,
    recipientAmount: received, exchangeRate: String(userRate),
    costPartial: true,
    costNote: "Xflow's quote is an indicative FX rate; it does not itemize every collection or payout charge.",
    quoteType: "live", accountContext: "customer_connected", verificationType: "provider_reported",
    observedAt: now.toISOString(), quotedAt: now.toISOString(), expiresAt: validTo,
  };
}

async function testConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  try {
    const response = await fetch(`${BASE}/v1/accounts?limit=1`, { headers: headers(credentials), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { ok: false, detail: `Xflow account check failed (HTTP ${response.status}).` };
    return { ok: true, detail: "Xflow authenticated. Quote access is checked for each requested route." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Could not reach Xflow." };
  }
}

async function getQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  if (request.destinationCurrency.toUpperCase() !== "INR" || (request.destinationCountry && request.destinationCountry.toUpperCase() !== "IN")) {
    throw new Error("Xflow's documented payout FX quote is for settlement into India (INR).");
  }
  const sell = request.sourceAsset.toUpperCase();
  if (!/^[A-Z]{3}$/.test(sell) || sell === "INR" || !Number.isFinite(request.amount) || request.amount <= 0) throw new Error("Xflow needs a positive foreign-currency amount for INR settlement.");
  const params = new URLSearchParams({ "sell.amount": String(request.amount), "sell.currency": sell, "buy.currency": "INR", type: "payout_fx" });
  const response = await fetch(`${BASE}/v1/quotes?${params}`, { headers: headers(credentials), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Xflow quote failed (HTTP ${response.status}); check account capability and currency access.`);
  return xflowQuoteToUnified(await response.json() as Record<string, unknown>, { ...request, sourceAsset: sell });
}

export const xflowProviderAdapter: ProviderAdapter = {
  slug: "xflow",
  credentialFields: [
    { key: "apiKey", label: "Secret API key", secret: true, placeholder: "sk_test_… or sk_live_…" },
    { key: "accountId", label: "Connected user account ID (platforms only)" },
  ],
  testConnection,
  getQuote,
};
