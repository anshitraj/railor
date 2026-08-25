/**
 * Provider adapters — the one place Railor's own request shapes get
 * translated into (and out of) a specific provider's own API.
 *
 * Only Circle and Coinbase are implemented, built strictly from each
 * provider's public API documentation. Neither has been exercised against a
 * live account: Railor holds no real provider credentials to test with
 * until a user connects their own (see `providerConnections` in schema.ts —
 * "Stage 5 architecture... no credentials in V1" before this).
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
};

export function getAdapter(slug: string): ProviderAdapter | null {
  return ADAPTERS[slug] ?? null;
}
