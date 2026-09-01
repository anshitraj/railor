/**
 * Provider adapters — the one place Railor's own request shapes get
 * translated into (and out of) a specific provider's own API.
 *
 * Built strictly from each provider's public API documentation and, where
 * that was thin or wrong, from empirically probing the live endpoint with a
 * fake key and confirming a clean 401 (not a 404 or connection error) —
 * that's real evidence the URL and auth-header shape are correct, the most
 * this adapter can prove without a live account. Railor holds no provider
 * credentials of its own here; every call in this file runs against
 * whatever a customer connects through Settings > Connections, which
 * `apps/web/lib/connections.ts` encrypts (AES-256-GCM) into
 * `provider_connections.encrypted_credentials` and only ever decrypts
 * server-side, immediately before an adapter call — never returned to a
 * client, never logged.
 *
 * No adapter executes a transfer. That is not a gap to fill in — see
 * executeTransfer at the bottom of this file, which refuses unconditionally
 * regardless of provider or credentials.
 *
 * Circle, Bridge, MoonPay: testConnection is real, request-shape-verified
 * as above.
 * Nium: auth shape (x-api-key header + clientHashId path param) and the
 * testConnection endpoint are both real, from Nium's own published curl
 * example — but unlike Circle/Bridge/MoonPay, no empirical fake-key probe
 * was run against it this session, so it is unverified against a live
 * response until a real key confirms it.
 * Paxos: real token endpoint (verified the same way), but testConnection
 * only proves the client_credentials exchange works, not that the resulting
 * token can call anything.
 * Coinbase: honest stub — CDP signs every request with a JWT, not
 * implemented, says so instead of faking a result.
 *
 * getQuote on Bridge and MoonPay: the endpoint and auth are verified the
 * same empirical way (a fake key gets a clean 401 from a real, named
 * error, not a 404). The *response body* parsing below is not verified —
 * every real call so far has only ever returned an auth-error body, never
 * a success body, so the field names a successful quote actually returns
 * are a best-effort reading of public docs, unconfirmed against live data.
 * getQuote on Circle: request/response shape is fully verified (copied
 * directly from Circle's own CPN quickstart example, not summarized) — but
 * requires the caller to supply `paymentMethodType` and `entityCountry`
 * explicitly; this file never infers either from the destination currency.
 */
import type { ExecutionRequest, ExecutionResult, QuoteRequest, UnifiedQuote } from "./unified.js";

export interface CredentialField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  detail: string;
}

export interface ProviderAdapter {
  slug: string;
  credentialFields: CredentialField[];
  /** A cheap authenticated call that proves the credentials are real and live, not just well-formed. */
  testConnection(credentials: Record<string, string>): Promise<ConnectionTestResult>;
  /** Not implemented by every adapter — absent means this provider has no quote support yet. */
  getQuote?(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote>;
}

async function circleTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) return { ok: false, detail: "API key is required." };
  const base =
    credentials.environment?.trim().toLowerCase() === "production"
      ? "https://api.circle.com"
      : "https://api-sandbox.circle.com";
  try {
    const response = await fetch(`${base}/v1/configuration`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: `Circle rejected the key (HTTP ${response.status}).` };
    }
    if (!response.ok) return { ok: false, detail: `Unexpected response from Circle (HTTP ${response.status}).` };
    return { ok: true, detail: "Connected." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Network error reaching Circle." };
  }
}

async function coinbaseTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const keyName = credentials.keyName?.trim();
  const apiKey = credentials.apiKey?.trim();
  if (!keyName || !apiKey) return { ok: false, detail: "Key name and private key are both required." };
  // Coinbase's CDP platform signs every request with a JWT (ES256), not a
  // bare bearer token — implementing that signing correctly is real,
  // unverified-without-a-key work this adapter doesn't attempt yet, so it
  // can confirm credentials were entered but not that Coinbase accepts them.
  return {
    ok: false,
    detail: "Coinbase's signed-JWT auth isn't wired up yet — credentials saved, not verified.",
  };
}

async function bridgeTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) return { ok: false, detail: "API key is required." };
  try {
    const response = await fetch("https://api.bridge.xyz/v0/api_keys/whoami", {
      headers: { "Api-Key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: `Bridge rejected the key (HTTP ${response.status}).` };
    }
    if (!response.ok) return { ok: false, detail: `Unexpected response from Bridge (HTTP ${response.status}).` };
    return { ok: true, detail: "Connected." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Network error reaching Bridge." };
  }
}

async function moonpayTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) return { ok: false, detail: "Secret API key is required." };
  try {
    const response = await fetch("https://api.moonpay.com/v3/accounts/me", {
      headers: { authorization: `Api-Key ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: `MoonPay rejected the key (HTTP ${response.status}).` };
    }
    if (!response.ok) return { ok: false, detail: `Unexpected response from MoonPay (HTTP ${response.status}).` };
    return { ok: true, detail: "Connected." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Network error reaching MoonPay." };
  }
}

async function bridgeGetQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) throw new Error("API key is required.");
  const params = new URLSearchParams({
    from: request.sourceAsset.toLowerCase(),
    to: request.destinationCurrency.toLowerCase(),
  });
  const response = await fetch(`https://api.bridge.xyz/v0/exchange_rates?${params}`, {
    headers: { "Api-Key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Bridge quote request failed (HTTP ${response.status}).`);
  // Field names below are a best-effort reading of public docs — see this
  // file's header comment. Unknown/missing fields degrade to undefined
  // rather than throwing, so a wrong guess here shows up as a thin quote,
  // not a crash.
  const body = (await response.json()) as { midmarket_rate?: string; buy_rate?: string };
  const rate = Number(body.midmarket_rate ?? body.buy_rate);
  const now = new Date().toISOString();
  return {
    providerSlug: "bridge",
    sourceAsset: request.sourceAsset,
    sourceNetwork: request.sourceNetwork,
    destinationCurrency: request.destinationCurrency,
    destinationCountry: request.destinationCountry,
    amount: request.amount,
    feeAmount: Number.isFinite(rate) ? request.amount - request.amount * rate : undefined,
    feeCurrency: request.destinationCurrency,
    exchangeRate: Number.isFinite(rate) ? String(rate) : undefined,
    // This is a mid-market/buy rate reference, not a bound quote from a
    // payout-specific endpoint — see this file's header comment on why the
    // response body here is unverified against live data. Honest label
    // rather than claiming a firm LIVE price this call didn't actually bind.
    costPartial: true,
    quoteType: "indicative",
    accountContext: "customer_connected",
    verificationType: "provider_reported",
    observedAt: now,
    quotedAt: now,
  };
}

async function moonpayGetQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) throw new Error("Secret API key is required.");
  const params = new URLSearchParams({
    baseCurrencyAmount: String(request.amount),
    baseCurrencyCode: request.destinationCurrency.toLowerCase(),
    apiKey,
  });
  const response = await fetch(
    `https://api.moonpay.com/v3/currencies/${request.sourceAsset.toLowerCase()}/buy_quote?${params}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new Error(`MoonPay quote request failed (HTTP ${response.status}).`);
  // Same caveat as Bridge's quote above: endpoint and auth are verified,
  // these field names are not.
  const body = (await response.json()) as { feeAmount?: number; quoteCurrencyAmount?: number };
  const now = new Date().toISOString();
  return {
    providerSlug: "moonpay",
    sourceAsset: request.sourceAsset,
    sourceNetwork: request.sourceNetwork,
    destinationCurrency: request.destinationCurrency,
    destinationCountry: request.destinationCountry,
    amount: request.amount,
    recipientAmount: body.quoteCurrencyAmount,
    feeAmount: body.feeAmount,
    feeCurrency: request.destinationCurrency,
    // MoonPay's buy_quote is a real, live-called endpoint (see this file's
    // header comment), so this is a genuine LIVE quote — but the response
    // is not broken into fee components, so the total may not be complete.
    costPartial: true,
    quoteType: "live",
    accountContext: "customer_connected",
    verificationType: "provider_reported",
    observedAt: now,
    quotedAt: now,
  };
}

async function niumTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const apiKey = credentials.apiKey?.trim();
  const clientHashId = credentials.clientHashId?.trim();
  if (!apiKey || !clientHashId) return { ok: false, detail: "API key and Client Hash ID are both required." };
  try {
    // Real, read-only "get client info" endpoint — verified via WebSearch
    // against Nium's own documented curl example (docs.nium.com), not
    // guessed: GET /api/v1/client/{clientHashId} with an x-api-key header.
    // No fake-key empirical probe was run for this one (unlike Circle/
    // Bridge/MoonPay above) — this adapter is unverified against a live
    // response until a real key confirms it.
    const response = await fetch(`https://gateway.nium.com/api/v1/client/${encodeURIComponent(clientHashId)}`, {
      headers: { "x-api-key": apiKey, "x-request-id": crypto.randomUUID() },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: `Nium rejected the credentials (HTTP ${response.status}).` };
    }
    if (response.status === 404) {
      return { ok: false, detail: "Nium returned 404 — check the Client Hash ID (this is a path parameter, not a header)." };
    }
    if (!response.ok) return { ok: false, detail: `Unexpected response from Nium (HTTP ${response.status}).` };
    return { ok: true, detail: "Connected." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Network error reaching Nium." };
  }
}

async function circleCpnGetQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) throw new Error("API key is required.");
  if (!request.destinationCountry) throw new Error("destinationCountry is required for a Circle CPN quote.");
  // CPN's paymentMethodType (SPEI/SEPA/PIX/WIRE/...) is never inferred from
  // the currency — that mapping isn't 1:1 (EUR alone spans SEPA and WIRE)
  // and guessing it is exactly the kind of fabricated route dimension this
  // codebase's evidence discipline forbids. The caller must know it.
  if (!request.paymentMethodType) throw new Error("paymentMethodType is required for a Circle CPN quote (e.g. SPEI, SEPA, PIX) — Railor does not infer it from the destination currency.");
  if (!request.entityCountry) throw new Error("entityCountry is required for a Circle CPN quote.");
  const { getCpnQuote } = await import("./provider-research/circle-cpn.js");
  // Circle's core Payments API key and its Payments Network (CPN) enrollment
  // are not guaranteed to be the same grant — if this key isn't CPN-enrolled,
  // Circle's own 401/403 surfaces through CircleCpnRequestError untouched
  // rather than this adapter guessing at a fallback.
  const quote = await getCpnQuote(
    {
      paymentMethodType: request.paymentMethodType,
      senderCountry: request.entityCountry,
      destinationCountry: request.destinationCountry,
      sourceCurrency: request.sourceAsset,
      destinationAmount: String(request.amount),
      destinationCurrency: request.destinationCurrency,
      blockchain: request.sourceNetwork ?? "ETH",
    },
    apiKey,
  );
  return {
    providerSlug: "circle",
    providerQuoteId: quote.id,
    sourceAsset: quote.sourceAmount.currency,
    sourceNetwork: quote.blockchain,
    destinationCurrency: quote.destinationAmount.currency,
    destinationCountry: quote.destinationCountry,
    amount: Number(quote.sourceAmount.amount),
    recipientAmount: Number(quote.destinationAmount.amount),
    feeAmount: quote.totalFee ? Number(quote.totalFee.amount) : undefined,
    feeCurrency: quote.totalFee?.currency,
    exchangeRate: quote.exchangeRate?.rate,
    estimatedArrivalMinutes: quote.settlementMinutesMax ?? undefined,
    costPartial: false,
    quoteType: "live",
    accountContext: "customer_connected",
    verificationType: "provider_reported",
    observedAt: new Date().toISOString(),
    expiresAt: quote.quoteExpireDate,
    quotedAt: new Date().toISOString(),
  };
}

async function paxosTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  if (!clientId || !clientSecret) return { ok: false, detail: "Client ID and client secret are both required." };
  try {
    const response = await fetch("https://oauth.paxos.com/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 400) {
      return { ok: false, detail: `Paxos rejected the client credentials (HTTP ${response.status}).` };
    }
    if (!response.ok) return { ok: false, detail: `Unexpected response from Paxos (HTTP ${response.status}).` };
    return { ok: true, detail: "Token issued — client credentials are valid." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Network error reaching Paxos." };
  }
}

export const ADAPTERS: Record<string, ProviderAdapter> = {
  circle: {
    slug: "circle",
    credentialFields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "environment", label: "Environment", placeholder: "sandbox or production" },
    ],
    testConnection: circleTestConnection,
    // Tests the core Payments API; quotes against the separate CPN product —
    // see circleCpnGetQuote's own comment on why that distinction matters.
    getQuote: circleCpnGetQuote,
  },
  nium: {
    slug: "nium",
    credentialFields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "clientHashId", label: "Client Hash ID" },
    ],
    testConnection: niumTestConnection,
  },
  coinbase: {
    slug: "coinbase",
    credentialFields: [
      { key: "keyName", label: "Key name" },
      { key: "apiKey", label: "Private key", secret: true },
    ],
    testConnection: coinbaseTestConnection,
  },
  bridge: {
    slug: "bridge",
    credentialFields: [{ key: "apiKey", label: "API key", secret: true }],
    testConnection: bridgeTestConnection,
    getQuote: bridgeGetQuote,
  },
  moonpay: {
    slug: "moonpay",
    credentialFields: [{ key: "apiKey", label: "Secret API key", secret: true }],
    testConnection: moonpayTestConnection,
    getQuote: moonpayGetQuote,
  },
  paxos: {
    slug: "paxos",
    credentialFields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    testConnection: paxosTestConnection,
  },
};

export function getAdapter(slug: string): ProviderAdapter | null {
  return ADAPTERS[slug] ?? null;
}

/**
 * Execution — deliberately not implemented by any adapter, and not part of
 * the ProviderAdapter interface at all, so there is no per-provider surface
 * where a real transfer call could be added quietly. This is the one
 * function anything in Railor that wants to move money would have to call,
 * and it always refuses. Real execution needs money-transmission compliance
 * this codebase has no way to verify — that is a decision for a human to
 * make deliberately, not something to wire up as a side effect of a feature
 * request.
 */
export async function executeTransfer(
  providerSlug: string,
  _credentials: Record<string, string>,
  _request: ExecutionRequest,
): Promise<ExecutionResult> {
  return {
    providerSlug,
    status: "not_implemented",
    detail: "Railor does not execute transfers. This call was refused, not attempted.",
  };
}
