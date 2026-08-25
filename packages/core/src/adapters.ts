/**
 * Provider adapters — the one place Railor's own request shapes get
 * translated into (and out of) a specific provider's own API.
 *
 * Built strictly from each provider's public API documentation and, where
 * that was thin or wrong, from empirically probing the live endpoint with a
 * fake key and confirming a clean 401 (not a 404 or connection error) —
 * that's real evidence the URL and auth-header shape are correct, the most
 * this adapter can prove without a live account. Railor holds no provider
 * credentials of its own; every testConnection call here only ever runs
 * against whatever a user pastes in themselves (see `providerConnections`
 * in schema.ts — "Stage 5 architecture... no credentials in V1" before this).
 *
 * Circle, Bridge, MoonPay: real, request-shape-verified as above.
 * Paxos: real token endpoint (verified the same way), but testConnection
 * only proves the client_credentials exchange works, not that the resulting
 * token can call anything.
 * Coinbase: honest stub — CDP signs every request with a JWT, not
 * implemented, says so instead of faking a result.
 */

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
  /**
   * Not implemented by any adapter yet — no provider's actual quote/rate
   * endpoint has been verified the way testConnection's endpoints have.
   * Declared now so UnifiedQuote (see unified.ts) has somewhere real to
   * land instead of needing the interface redesigned when it does exist.
   */
  getQuote?(credentials: Record<string, string>, request: Record<string, unknown>): Promise<unknown>;
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
  },
  moonpay: {
    slug: "moonpay",
    credentialFields: [{ key: "apiKey", label: "Secret API key", secret: true }],
    testConnection: moonpayTestConnection,
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
