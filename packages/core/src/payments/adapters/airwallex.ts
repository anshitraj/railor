import { createHash } from "node:crypto";
import type { ConnectionTestResult, ProviderAdapter } from "../../adapters.js";
import type { QuoteRequest, UnifiedQuote } from "../../unified.js";
import { currencyScale, providerRequest, toDecimalString } from "../http.js";
import type { ConnectionEnvironment, NormalizedTransferStatus, PayoutAdapter, PayoutBeneficiary, PayoutOutcome } from "../types.js";

/**
 * Airwallex — from airwallex.com/docs (API reference, 2026):
 *   Token     POST /api/v1/authentication/login  (x-client-id, x-api-key) → { token, expires_at }, valid 30 min
 *   FX quote  POST /api/v1/fx/quotes/create      { sell_currency, buy_currency, sell_amount, validity }
 *   Transfer  POST /api/v1/transfers/create      { request_id, beneficiary{…}, source_currency, source_amount,
 *                                                  transfer_currency, transfer_method, reason, reference }
 *   Status    GET  /api/v1/transfers/{id} | GET /api/v1/transfers (list)
 * Sandbox: api.sandbox.airwallex.com. Airwallex's edge answers anonymous
 * probes with an HTML 403, so unlike Wise these shapes could not be probed:
 * docs_verified only.
 *
 * Pricing is per account, so there is no public quote. The FX quote is the
 * customer's own rate but excludes the transfer fee, so it is marked
 * costPartial. `request_id` duplicates are rejected (not replayed) by
 * Airwallex, so an ambiguous create is resolved by listing transfers and
 * matching request_id — never by re-sending.
 *
 * Statuses (docs): IN_APPROVAL, APPROVAL_RECALLED/REJECTED/BLOCKED, SCHEDULED,
 * OVERDUE, PROCESSING, SENT, PAID, FAILED, CANCELLED. PAID can exceptionally
 * turn into FAILED later; Railor polls open payments only.
 */
const BASE: Record<ConnectionEnvironment, string> = {
  sandbox: "https://api.sandbox.airwallex.com",
  production: "https://api.airwallex.com",
};

const STATUS: Record<string, NormalizedTransferStatus> = {
  IN_APPROVAL: "processing",
  SCHEDULED: "processing",
  PROCESSING: "processing",
  SENT: "processing",
  OVERDUE: "awaiting_funds",
  PAID: "completed",
  FAILED: "failed",
  APPROVAL_REJECTED: "failed",
  APPROVAL_BLOCKED: "failed",
  APPROVAL_RECALLED: "cancelled",
  CANCELLED: "cancelled",
};

const STABLECOINS = new Set(["USDC", "USDT", "EURC", "PYUSD", "DAI", "USDP", "FDUSD", "USDE", "RLUSD"]);

const envOf = (credentials: Record<string, string>): ConnectionEnvironment =>
  credentials.environment?.trim().toLowerCase() === "production" ? "production" : "sandbox";

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(credentials: Record<string, string>, environment: ConnectionEnvironment): Promise<{ ok: true; token: string } | { ok: false; outcome: Extract<PayoutOutcome, { kind: "rejected" | "unknown" }> }> {
  const clientId = credentials.clientId?.trim();
  const apiKey = credentials.apiKey?.trim();
  if (!clientId || !apiKey) return { ok: false, outcome: { kind: "rejected", code: "connection_incomplete", message: "Airwallex needs a client ID and API key.", retryableElsewhere: true } };
  const key = createHash("sha256").update(`${environment}:${clientId}:${apiKey}`).digest("hex");
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return { ok: true, token: cached.token };
  const result = await providerRequest(`${BASE[environment]}/api/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client-id": clientId, "x-api-key": apiKey },
    body: "{}",
    timeoutMs: 10_000,
  });
  if (!result.ok) return result;
  const token = String(result.body.token ?? "");
  if (!token) return { ok: false, outcome: { kind: "rejected", code: "provider_auth_failed", message: "Airwallex issued no token.", retryableElsewhere: true } };
  const expiresAt = Date.parse(String(result.body.expires_at ?? "")) || Date.now() + 25 * 60_000;
  tokenCache.set(key, { token, expiresAt });
  return { ok: true, token };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

function fiat(currency: string) {
  const c = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(c) || STABLECOINS.has(c)) throw new Error(`Airwallex quotes and pays out fiat currencies; ${currency} is not one.`);
  return c;
}

async function airwallexTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const environment = envOf(credentials);
  const auth = await accessToken(credentials, environment);
  if (!auth.ok) return { ok: false, detail: `Airwallex rejected the credentials: ${auth.outcome.message}` };
  const balances = await providerRequest(`${BASE[environment]}/api/v1/balances/current`, { method: "GET", headers: bearer(auth.token), timeoutMs: 10_000 });
  if (!balances.ok) return { ok: true, detail: `Token issued; balances not readable with this key (${balances.outcome.message}).` };
  const list = (Array.isArray(balances.body) ? balances.body : []) as Array<{ currency?: string; available_amount?: number }>;
  const funded = list.filter((b) => (b.available_amount ?? 0) > 0).map((b) => b.currency).filter(Boolean);
  return { ok: true, detail: `Connected${funded.length ? ` — balances in ${funded.slice(0, 6).join(", ")}` : ""}.` };
}

/**
 * The customer's own FX rate for the pair. `currency_pair` names the base
 * currency; the markup against `mid_rate` is signed by which side the
 * customer is buying.
 */
export function airwallexQuoteToUnified(body: Record<string, unknown>, request: QuoteRequest, now = new Date()): UnifiedQuote {
  const buyAmount = Number(body.buy_amount);
  const clientRate = Number(body.client_rate);
  const midRate = Number(body.mid_rate);
  const pair = typeof body.currency_pair === "string" ? body.currency_pair : "";
  let fxSpreadAmount: number | undefined;
  if (Number.isFinite(clientRate) && Number.isFinite(midRate) && midRate > 0 && pair.length === 6) {
    const baseIsBuy = pair.slice(0, 3) === request.destinationCurrency.toUpperCase();
    const markup = baseIsBuy ? clientRate / midRate - 1 : 1 - clientRate / midRate;
    fxSpreadAmount = Math.round(request.amount * markup * 100) / 100;
  }
  return {
    providerSlug: "airwallex",
    providerQuoteId: typeof body.quote_id === "string" ? body.quote_id : undefined,
    sourceAsset: request.sourceAsset,
    sourceNetwork: request.sourceNetwork,
    destinationCurrency: request.destinationCurrency,
    destinationCountry: request.destinationCountry,
    amount: request.amount,
    recipientAmount: Number.isFinite(buyAmount) ? buyAmount : undefined,
    fxSpreadAmount,
    feeCurrency: request.sourceAsset,
    // The FX quote has no transfer fee in it; Airwallex prices payouts per account and method.
    costPartial: true,
    exchangeRate: Number.isFinite(buyAmount) && request.amount > 0 ? String(Math.round((buyAmount / request.amount) * 1e6) / 1e6) : undefined,
    quoteType: "live",
    accountContext: "customer_connected",
    verificationType: "provider_reported",
    observedAt: now.toISOString(),
    expiresAt: typeof body.valid_to_at === "string" ? new Date(body.valid_to_at.replace(/\+0000$/, "Z")).toISOString() : undefined,
    quotedAt: now.toISOString(),
  };
}

async function airwallexGetQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  const environment = envOf(credentials);
  const sell = fiat(request.sourceAsset);
  const buy = fiat(request.destinationCurrency);
  if (sell === buy) {
    const now = new Date().toISOString();
    // No FX endpoint was called, and a payout may still carry a transfer fee.
    // This is only a same-currency reference, never a live recipient payout.
    return { providerSlug: "airwallex", sourceAsset: request.sourceAsset, destinationCurrency: buy, destinationCountry: request.destinationCountry, amount: request.amount, costPartial: true, quoteType: "indicative", accountContext: "customer_connected", verificationType: "railor_observed", observedAt: now, quotedAt: now };
  }
  const auth = await accessToken(credentials, environment);
  if (!auth.ok) throw new Error(auth.outcome.message);
  const result = await providerRequest(`${BASE[environment]}/api/v1/fx/quotes/create`, {
    method: "POST",
    headers: bearer(auth.token),
    body: JSON.stringify({ sell_currency: sell, buy_currency: buy, sell_amount: request.amount, validity: "MIN_1" }),
    timeoutMs: 10_000,
  });
  if (!result.ok) throw new Error(`Airwallex quote: ${result.outcome.message}`);
  return airwallexQuoteToUnified(result.body, request);
}

export const airwallexProviderAdapter: ProviderAdapter = {
  slug: "airwallex",
  credentialFields: [
    { key: "clientId", label: "Client ID" },
    { key: "apiKey", label: "API key", secret: true },
  ],
  testConnection: airwallexTestConnection,
  getQuote: airwallexGetQuote,
};

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1)! } : { first_name: name.trim(), last_name: name.trim() };
}

/** Railor beneficiary → Airwallex inline `beneficiary` object (BANK_ACCOUNT). */
export function airwallexBeneficiary(b: PayoutBeneficiary) {
  const d = b.details;
  const holder = b.holderType === "business" ? { entity_type: "COMPANY", company_name: b.holderName } : { entity_type: "PERSONAL", ...splitName(b.holderName) };
  const common = { account_name: b.holderName, account_currency: b.currency, bank_country_code: b.country, ...(d.bankName ? { bank_name: d.bankName } : {}) };
  let bank_details: Record<string, unknown>;
  switch (b.method) {
    case "bank_us":
      bank_details = { ...common, account_number: d.accountNumber, account_routing_type1: "aba", account_routing_value1: d.routingNumber, local_clearing_system: "ACH" };
      break;
    case "gb":
      bank_details = { ...common, account_number: d.accountNumber, account_routing_type1: "sort_code", account_routing_value1: d.sortCode?.replace(/\D/g, "") };
      break;
    case "iban":
      bank_details = { ...common, iban: d.iban?.replace(/\s+/g, "").toUpperCase(), ...(d.bic ? { swift_code: d.bic } : {}) };
      break;
    case "in_bank":
      bank_details = { ...common, account_number: d.accountNumber, account_routing_type1: "ifsc", account_routing_value1: d.ifsc };
      break;
    default:
      throw new Error(`Airwallex payouts from Railor don't support ${b.method} beneficiaries yet.`);
  }
  const address = d.addressLine1 || d.city ? { address: { country_code: b.country, street_address: d.addressLine1, city: d.city, state: d.state, postcode: d.postalCode } } : {};
  return { type: "BANK_ACCOUNT", ...holder, ...address, bank_details };
}

function transferOutcome(body: Record<string, unknown>): PayoutOutcome {
  const status = String(body.status ?? "PROCESSING");
  return {
    kind: "accepted",
    providerReference: `transfer:${String(body.id)}`,
    providerStatus: status,
    status: STATUS[status] ?? "processing",
    recipientAmount: body.amount_beneficiary_receives !== undefined ? String(body.amount_beneficiary_receives) : undefined,
    feeAmount: body.fee_amount !== undefined ? String(body.fee_amount) : undefined,
    feeCurrency: typeof body.fee_currency === "string" ? body.fee_currency : undefined,
    response: { id: body.id, status, short_reference_id: body.short_reference_id },
  };
}

async function findByRequestId(base: string, token: string, requestId: string, createdAt: Date) {
  const from = new Date(createdAt.getTime() - 10 * 60_000).toISOString();
  const result = await providerRequest(`${base}/api/v1/transfers?from_created_at=${encodeURIComponent(from)}&page_size=100`, { method: "GET", headers: bearer(token) });
  if (!result.ok) return null;
  const items = (result.body.items ?? result.body.data ?? []) as Array<Record<string, unknown>>;
  return items.find((t) => t.request_id === requestId) ?? null;
}

export const airwallexPayoutAdapter: PayoutAdapter = {
  slug: "airwallex",
  verification: "docs_verified",
  supportedMethods: ["bank_us", "gb", "iban", "in_bank"],
  payoutCredentialFields: [{ key: "transferReason", label: "Transfer reason code (optional)", placeholder: "professional_business_services" }],

  async createPayout(credentials, request) {
    let sourceCurrency: string;
    let transferCurrency: string;
    let sourceAmount: number;
    let beneficiary: ReturnType<typeof airwallexBeneficiary>;
    try {
      sourceCurrency = fiat(request.sourceCurrency);
      transferCurrency = fiat(request.destinationCurrency);
      // A JSON number at the currency's own precision, as the reference documents (not "1000.00000000").
      sourceAmount = Number(toDecimalString(request.amount, currencyScale(sourceCurrency)));
      beneficiary = airwallexBeneficiary(request.beneficiary);
    } catch (error) {
      return { kind: "rejected", code: "unsupported_route", message: (error as Error).message, retryableElsewhere: true };
    }
    const auth = await accessToken(credentials, request.environment);
    if (!auth.ok) return auth.outcome.kind === "unknown" ? { kind: "rejected", code: "provider_unavailable", message: auth.outcome.message, retryableElsewhere: true } : auth.outcome;
    const result = await providerRequest(`${BASE[request.environment]}/api/v1/transfers/create`, {
      method: "POST",
      headers: bearer(auth.token),
      body: JSON.stringify({
        request_id: request.idempotencyKey,
        beneficiary,
        source_currency: sourceCurrency,
        source_amount: sourceAmount,
        transfer_currency: transferCurrency,
        transfer_method: "LOCAL",
        reason: credentials.transferReason?.trim() || "professional_business_services",
        reference: (request.reference ?? "Railor payout").slice(0, 35),
        client_data: request.paymentId,
      }),
    });
    if (result.ok) return transferOutcome(result.body);
    // A reused request_id means Airwallex already has this attempt: never a failure, look it up.
    if (result.outcome.kind === "rejected" && /duplicate|request_id/i.test(`${result.outcome.code} ${result.outcome.message}`)) {
      return { kind: "unknown", message: "Airwallex already has a transfer for this attempt; reconciling by request_id." };
    }
    return result.outcome;
  },

  async getPayout(credentials, lookup) {
    const auth = await accessToken(credentials, lookup.environment);
    if (!auth.ok) return { found: false, failureMessage: auth.outcome.message };
    const base = BASE[lookup.environment];
    let body: Record<string, unknown> | null = null;
    if (lookup.providerReference?.startsWith("transfer:")) {
      const result = await providerRequest(`${base}/api/v1/transfers/${encodeURIComponent(lookup.providerReference.slice(9))}`, { method: "GET", headers: bearer(auth.token) });
      if (!result.ok) return { found: false, failureMessage: result.outcome.message };
      body = result.body;
    } else {
      body = await findByRequestId(base, auth.token, lookup.idempotencyKey, lookup.createdAt);
      if (!body) return { found: false };
    }
    const status = String(body.status ?? "");
    const failure = body.failure as { message?: string } | undefined;
    return {
      found: true,
      providerReference: `transfer:${String(body.id)}`,
      providerStatus: status,
      status: STATUS[status],
      failureMessage: failure?.message,
    };
  },
};
