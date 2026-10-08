import { createHash } from "node:crypto";
import type { ConnectionTestResult, ProviderAdapter } from "../../adapters.js";
import type { QuoteRequest, UnifiedQuote } from "../../unified.js";

// Payouts v3 uses OAuth client credentials, unlike dLocal's Payins/HMAC API.
// https://docs.dlocal.com/reference/security-payouts-v3
// https://docs.dlocal.com/docs/quotes-configuration-payouts-v3
const BASE = { sandbox: "https://sandbox.dlocal.com", production: "https://api.dlocal.com" } as const;
const tokens = new Map<string, { token: string; expiresAt: number }>();

function environment(credentials: Record<string, string>): keyof typeof BASE {
  return credentials.environment === "production" ? "production" : "sandbox";
}

async function accessToken(credentials: Record<string, string>): Promise<string> {
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  if (!clientId || !clientSecret) throw new Error("dLocal Payouts v3 client ID and client secret are required.");
  const env = environment(credentials);
  const key = createHash("sha256").update(`${env}:${clientId}:${clientSecret}`).digest("hex");
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await fetch(`${BASE[env]}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`dLocal OAuth failed (HTTP ${response.status}).`);
  const body = await response.json() as { access_token?: unknown; expires_in?: unknown; scope?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) throw new Error("dLocal issued no OAuth access token.");
  const expiresIn = Number(body.expires_in);
  // dLocal documents 180-second tokens; refresh early and never reuse indefinitely.
  const lifetime = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.min(expiresIn, 180) : 180;
  tokens.set(key, { token: body.access_token, expiresAt: Date.now() + Math.max(1, lifetime - 30) * 1000 });
  if (tokens.size > 128) tokens.delete(tokens.keys().next().value!);
  return body.access_token;
}

function positive(value: unknown, label: string): number {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`dLocal returned an invalid ${label}.`);
  return n;
}

function nonnegative(value: unknown, label: string): number {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new Error(`dLocal returned an invalid ${label}.`);
  return n;
}

export function dlocalQuoteToUnified(body: Record<string, unknown>, request: QuoteRequest, now = new Date()): UnifiedQuote {
  // The v3 configuration guide uses quote_id/detail; the newer endpoint
  // reference illustrates id/details. Accept both documented envelopes.
  const details = (body.detail ?? body.details) as Record<string, unknown> | undefined;
  const quoteId = body.quote_id ?? body.id;
  if (body.status !== undefined && String(body.status) !== "0") throw new Error("dLocal did not approve the quote request.");
  if (typeof quoteId !== "string" || !quoteId || !details || details.source_currency !== "USD" || details.destination_currency !== request.destinationCurrency.toUpperCase()) {
    throw new Error("dLocal returned a quote for a different route or no quote ID.");
  }
  const sourceAmount = positive(details.source_amount, "source amount");
  if (Math.abs(sourceAmount - request.amount) > 0.01) throw new Error("dLocal returned a quote for a different amount.");
  const recipientAmount = positive(details.destination_amount, "recipient amount");
  const rate = positive(details.exchange_rate ?? recipientAmount / sourceAmount, "FX rate");
  const fee = body.fee as Record<string, unknown> | undefined;
  const tax = body.tax as Record<string, unknown> | undefined;
  const debit = body.debit as Record<string, unknown> | undefined;
  const feeTotal = fee?.fee_amount !== undefined && tax?.tax_amount !== undefined
    && fee.fee_currency === "USD" && tax.tax_currency === "USD"
    ? nonnegative(fee.fee_amount, "fee") + nonnegative(tax.tax_amount, "tax") : undefined;
  const debitAmount = debit?.debit_currency === "USD" && debit.debit_amount !== undefined ? positive(debit.debit_amount, "total debit") : undefined;
  const expiration = body.expiration_time;
  const expiresAt = typeof expiration === "string" && Number.isFinite(Date.parse(expiration)) ? new Date(expiration).toISOString() : undefined;
  return {
    providerSlug: "dlocal", providerQuoteId: quoteId,
    sourceAsset: "USD", destinationCurrency: request.destinationCurrency.toUpperCase(), destinationCountry: request.destinationCountry,
    amount: request.amount, recipientAmount, exchangeRate: String(rate), feeAmount: feeTotal, feeCurrency: feeTotal === undefined ? undefined : "USD",
    // source_amount is the payout principal; fees/taxes can increase the debit.
    // The calculator's input is a fixed send budget, so never rank this
    // recipient amount as if it cost only that budget.
    costPartial: true,
    costNote: debitAmount !== undefined
      ? `dLocal quoted ${recipientAmount} ${request.destinationCurrency.toUpperCase()} for ${sourceAmount} USD principal; total debit is ${debitAmount} USD including applicable fees and taxes. This is not a fixed-${request.amount} USD total-cost comparison.`
      : "dLocal's quote may debit fees and taxes in addition to the source amount; a fixed-budget total is not established.",
    quoteType: "live", accountContext: "customer_connected", verificationType: "provider_reported",
    observedAt: now.toISOString(), quotedAt: now.toISOString(), expiresAt,
  };
}

async function testConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  try {
    await accessToken(credentials);
    return { ok: true, detail: "dLocal Payouts v3 OAuth authenticated. Quote API activation and country access are checked when quoting." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Could not reach dLocal." };
  }
}

async function getQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  const country = request.destinationCountry?.toUpperCase();
  const currency = request.destinationCurrency.toUpperCase();
  if (request.sourceAsset.toUpperCase() !== "USD") throw new Error("dLocal Payouts v3 Quote API documents USD-funded conversions only.");
  if (!country || !/^[A-Z]{2}$/.test(country)) throw new Error("dLocal requires a two-letter destination country.");
  if (!/^[A-Z]{3}$/.test(currency) || currency === "USD") throw new Error("dLocal requires a local destination currency different from USD.");
  if (!Number.isFinite(request.amount) || request.amount <= 0 || request.amount > 9_999_999_999.99) throw new Error("dLocal requires a valid positive source amount.");
  const token = await accessToken(credentials);
  const response = await fetch(`${BASE[environment(credentials)]}/payouts/v3/quote`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Version": "3.0", "X-Date": new Date().toISOString() },
    body: JSON.stringify({ country, source_currency: "USD", destination_currency: currency, source_amount: request.amount }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`dLocal Quote API failed (HTTP ${response.status}); confirm Quote API activation, IP allowlist and corridor access.`);
  return dlocalQuoteToUnified(await response.json() as Record<string, unknown>, { ...request, destinationCountry: country });
}

export const dlocalProviderAdapter: ProviderAdapter = {
  slug: "dlocal",
  credentialFields: [
    { key: "clientId", label: "Payouts v3 client ID" },
    { key: "clientSecret", label: "Payouts v3 client secret", secret: true },
  ],
  testConnection,
  getQuote,
};
