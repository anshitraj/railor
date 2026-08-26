/**
 * Provider adapters — the one place Railor's own request shapes get
 * translated into (and out of) a specific provider's own API.
 *
 * Built strictly from each provider's public API documentation and, where
 * that was thin or wrong, from empirically probing the live endpoint with a
 * fake key and confirming a clean 401 (not a 404 or connection error) —
 * that's real evidence the URL and auth-header shape are correct, the most
 * this adapter can prove without a live account. Railor holds no provider
 * credentials of its own; every call here only ever runs against whatever a
 * user pastes in themselves (see `providerConnections` in schema.ts —
 * "Stage 5 architecture... no credentials in V1" before this).
 *
 * No adapter executes a transfer. That is not a gap to fill in — see
 * executeTransfer at the bottom of this file, which refuses unconditionally
 * regardless of provider or credentials.
 *
 * Circle, Bridge, MoonPay: testConnection is real, request-shape-verified
 * as above.
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
  return {
    providerSlug: "bridge",
    sourceAsset: request.sourceAsset,
    sourceNetwork: request.sourceNetwork,
    destinationCurrency: request.destinationCurrency,
    destinationCountry: request.destinationCountry,
    amount: request.amount,
    feeAmount: Number.isFinite(rate) ? request.amount - request.amount * rate : undefined,
    feeCurrency: request.destinationCurrency,
    quotedAt: new Date().toISOString(),
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
  return {
    providerSlug: "moonpay",
    sourceAsset: request.sourceAsset,
    sourceNetwork: request.sourceNetwork,
    destinationCurrency: request.destinationCurrency,
    destinationCountry: request.destinationCountry,
    amount: request.amount,
    feeAmount: body.feeAmount,
    feeCurrency: request.destinationCurrency,
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
