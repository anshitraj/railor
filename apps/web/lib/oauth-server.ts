import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { guardedGet } from "@railor/core";
import { apiKeys, getDb, oauthClients, oauthCodes, oauthTokens } from "@railor/database";
import { hashApiKey } from "./auth";
import { appOrigin } from "./security";

/**
 * OAuth 2.1 for the MCP endpoint, so chat apps that cannot send an API-key
 * header (ChatGPT, Claude's custom connectors) connect with a Railor sign-in
 * and one approval.
 *
 *  - Clients register themselves (RFC 7591) or are named by an https metadata
 *    document (their client_id is its URL). All are public clients: PKCE (S256)
 *    is required and there is no client secret.
 *  - Approving creates (or reuses) an identity API key for the workspace and
 *    client, so the grant is metered like any key and ended by revoking it in
 *    Developers → All keys.
 *  - Codes, access tokens and refresh tokens are stored as SHA-256 hashes.
 *    Codes are single-use; refresh tokens rotate on every use.
 */

export const OAUTH_SCOPE = "prices:read";
export const TOKEN_PREFIX = "rlo_";
const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_S = 30 * 86_400;
const MAX_IDENTITY_KEYS = 10;

export const mcpResource = () => `${appOrigin()}/api/mcp`;
export const protectedResourceMetadataUrl = () => `${appOrigin()}/.well-known/oauth-protected-resource/api/mcp`;

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [appOrigin()],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Railor MCP",
    resource_documentation: `${appOrigin()}/docs/mcp`,
  };
}

export function authorizationServerMetadata() {
  const origin = appOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [OAUTH_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/docs/mcp`,
  };
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

const sha = hashApiKey;
const secret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : "");

/** https, or http to the machine itself (native and CLI clients listen on a loopback port). */
export function validRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge the code was issued for. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const expected = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type OAuthClient = typeof oauthClients.$inferSelect;
interface Fail { ok: false; error: string; description: string }
const fail = (error: string, description: string): Fail => ({ ok: false, error, description });

/** RFC 7591 dynamic registration: a public client with exact redirect URIs. */
export async function registerClient(input: unknown): Promise<{ ok: true; client: OAuthClient } | Fail> {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirectUri)) {
    return fail("invalid_redirect_uri", "Send 1 to 10 redirect_uris, each https (or http on localhost) without credentials or a fragment.");
  }
  const name = clean(body.client_name, 80) || "An application";
  const id = secret("rlc_").slice(0, 36);
  const db = await getDb();
  const [client] = await db.insert(oauthClients).values({ id, name, redirectUris: [...new Set(uris as string[])], source: "registered" }).returning();
  return { ok: true, client: client! };
}

/** A client_id that is an https URL names a metadata document the client publishes about itself. */
async function clientFromMetadataDocument(clientId: string): Promise<OAuthClient | null> {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || url.hash || url.username || url.password || !url.pathname || url.pathname === "/") return null;
    const { body } = await guardedGet(clientId, { maxBytes: 20_000, timeoutMs: 4_000, maxRedirects: 0, accept: "application/json" });
    const doc = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris : [];
    if (doc.client_id !== clientId || !uris.length || uris.length > 10 || !uris.every(validRedirectUri)) return null;
    if (doc.token_endpoint_auth_method && doc.token_endpoint_auth_method !== "none") return null;
    const db = await getDb();
    const values = { id: clientId, name: clean(doc.client_name, 80) || url.hostname, redirectUris: [...new Set(uris as string[])], source: "metadata_document" as const };
    const [client] = await db.insert(oauthClients).values(values).onConflictDoUpdate({ target: oauthClients.id, set: { name: values.name, redirectUris: values.redirectUris, createdAt: new Date() } }).returning();
    return client ?? null;
  } catch { return null; }
}

export async function findClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 500) return null;
  const db = await getDb();
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  // A metadata-document client is re-read daily so a changed redirect list takes effect.
  if (row && (row.source === "registered" || Date.now() - row.createdAt.getTime() < 86_400_000)) return row;
  return clientId.startsWith("https://") ? ((await clientFromMetadataDocument(clientId)) ?? row ?? null) : (row ?? null);
}

export interface AuthorizeRequest { clientId: string; redirectUri: string; state: string | null; codeChallenge: string; scope: string; resource: string | null }

/**
 * Checks an authorization request. Problems with the client or its redirect
 * URI are shown to the person, never redirected (that would send them, and an
 * error, to an address nobody vouched for); other problems go back to the
 * client as an OAuth error.
 */
export async function validateAuthorizeRequest(params: Record<string, string | undefined>):
  Promise<{ ok: true; client: OAuthClient; request: AuthorizeRequest } | { ok: false; show: string } | { ok: false; redirect: string }> {
  const client = await findClient(params.client_id ?? "");
  if (!client) return { ok: false, show: "This application isn’t registered with Railor. Start the connection again from the app." };
  const redirectUri = params.redirect_uri ?? "";
  if (!client.redirectUris.includes(redirectUri)) return { ok: false, show: "This application sent a return address Railor doesn’t recognise, so nothing was shared." };
  const back = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (params.state) url.searchParams.set("state", params.state.slice(0, 500));
    url.searchParams.set("iss", appOrigin());
    return { ok: false as const, redirect: url.toString() };
  };
  if (params.response_type !== "code") return back("unsupported_response_type", "Only the authorization code flow is supported.");
  if (!params.code_challenge || params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge)) {
    return back("invalid_request", "PKCE with the S256 challenge method is required.");
  }
  const scopes = (params.scope ?? OAUTH_SCOPE).split(/\s+/).filter(Boolean);
  if (scopes.some((scope) => scope !== OAUTH_SCOPE)) return back("invalid_scope", `Only the ${OAUTH_SCOPE} scope is available.`);
  if (params.resource && params.resource !== mcpResource()) return back("invalid_target", "This server only issues tokens for the Railor MCP endpoint.");
  return {
    ok: true, client,
    request: { clientId: client.id, redirectUri, state: params.state?.slice(0, 500) ?? null, codeChallenge: params.code_challenge, scope: OAUTH_SCOPE, resource: params.resource ?? null },
  };
}

export const deniedRedirect = (request: AuthorizeRequest) => {
  const url = new URL(request.redirectUri);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("error_description", "The person declined to connect.");
  if (request.state) url.searchParams.set("state", request.state);
  url.searchParams.set("iss", appOrigin());
  return url.toString();
};

/** The workspace's identity key for this client: reused while it is live, so reconnecting doesn't pile up keys. */
async function identityKeyId(organizationId: string, userId: string, client: OAuthClient): Promise<string | { error: string }> {
  const db = await getDb();
  // One live key per app name and workspace: ChatGPT registers a fresh client on every connection, and reconnecting shouldn't pile up keys.
  const label = `${client.name} (OAuth)`.slice(0, 80);
  const [existing] = await db.select({ id: apiKeys.id }).from(apiKeys)
    .where(and(eq(apiKeys.organizationId, organizationId), eq(apiKeys.prefix, "oauth"), eq(apiKeys.label, label), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt)).limit(1);
  if (existing) return existing.id;
  const [active] = await db.select({ n: count() }).from(apiKeys).where(and(eq(apiKeys.organizationId, organizationId), eq(apiKeys.prefix, "oauth"), isNull(apiKeys.revokedAt)));
  if ((active?.n ?? 0) >= MAX_IDENTITY_KEYS) return { error: "This workspace already has 10 connected apps. Revoke one under Developers → All keys first." };
  const [key] = await db.insert(apiKeys).values({
    organizationId, createdBy: userId, label, mode: "test", prefix: "oauth",
    keyHash: hashApiKey(secret("rlk_")), revealableSecret: null,
  }).returning({ id: apiKeys.id });
  return key!.id;
}

/** The person approved: issue a one-time code and return where to send them. */
export async function approveAuthorization(args: { request: AuthorizeRequest; client: OAuthClient; organizationId: string; userId: string }): Promise<{ ok: true; redirect: string } | Fail> {
  const keyId = await identityKeyId(args.organizationId, args.userId, args.client);
  if (typeof keyId !== "string") return fail("access_denied", keyId.error);
  const db = await getDb();
  const code = secret("rlc-");
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date(Date.now() - 86_400_000)));
  await db.insert(oauthCodes).values({
    codeHash: sha(code), clientId: args.client.id, organizationId: args.organizationId, userId: args.userId, apiKeyId: keyId,
    redirectUri: args.request.redirectUri, codeChallenge: args.request.codeChallenge, scope: args.request.scope, expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  const url = new URL(args.request.redirectUri);
  url.searchParams.set("code", code);
  if (args.request.state) url.searchParams.set("state", args.request.state);
  url.searchParams.set("iss", appOrigin());
  return { ok: true, redirect: url.toString() };
}

const tokenResponse = (access: string, refresh: string, scope: string) => ({
  access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope,
});

export type TokenResult = { status: number; body: Record<string, unknown> };
const tokenError = (error: string, description: string, status = 400): TokenResult => ({ status, body: { error, error_description: description } });

/** POST /oauth/token for the authorization_code and refresh_token grants. */
export async function exchangeToken(form: URLSearchParams): Promise<TokenResult> {
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  const db = await getDb();
  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    if (!code || !clientId) return tokenError("invalid_request", "Send code and client_id.");
    // Consume atomically: a code works once, even if two requests race.
    const [row] = await db.update(oauthCodes).set({ consumedAt: new Date() })
      .where(and(eq(oauthCodes.codeHash, sha(code)), isNull(oauthCodes.consumedAt), gt(oauthCodes.expiresAt, new Date()))).returning();
    if (!row || row.clientId !== clientId || row.redirectUri !== (form.get("redirect_uri") ?? "") || !pkceMatches(verifier, row.codeChallenge)) {
      return tokenError("invalid_grant", "That code is invalid, expired or already used.");
    }
    const [key] = await db.select({ revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.id, row.apiKeyId)).limit(1);
    if (!key || key.revokedAt) return tokenError("invalid_grant", "This connection was revoked.");
    const access = secret(TOKEN_PREFIX);
    const refresh = secret("rlr_");
    await db.insert(oauthTokens).values({
      accessHash: sha(access), refreshHash: sha(refresh), clientId, organizationId: row.organizationId, userId: row.userId, apiKeyId: row.apiKeyId, scope: row.scope,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
    });
    return { status: 200, body: tokenResponse(access, refresh, row.scope) };
  }
  if (grant === "refresh_token") {
    const presented = form.get("refresh_token") ?? "";
    if (!presented || !clientId) return tokenError("invalid_request", "Send refresh_token and client_id.");
    const access = secret(TOKEN_PREFIX);
    const refresh = secret("rlr_");
    // Rotate in one statement: the old refresh token stops working the moment a new pair exists.
    const [row] = await db.update(oauthTokens).set({
      accessHash: sha(access), refreshHash: sha(refresh),
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
    }).where(and(
      eq(oauthTokens.refreshHash, sha(presented)), eq(oauthTokens.clientId, clientId), isNull(oauthTokens.revokedAt), gt(oauthTokens.refreshExpiresAt, new Date()),
      sql`exists (select 1 from api_keys where api_keys.id = ${oauthTokens.apiKeyId} and api_keys.revoked_at is null)`,
    )).returning({ scope: oauthTokens.scope });
    if (!row) return tokenError("invalid_grant", "That refresh token is invalid, expired or revoked.");
    return { status: 200, body: tokenResponse(access, refresh, row.scope) };
  }
  return tokenError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** The identity key behind a live OAuth access token, or null. */
export async function keyForAccessToken(token: string) {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const db = await getDb();
  const [row] = await db.select({ key: apiKeys }).from(oauthTokens)
    .innerJoin(apiKeys, eq(oauthTokens.apiKeyId, apiKeys.id))
    .where(and(eq(oauthTokens.accessHash, sha(token)), gt(oauthTokens.accessExpiresAt, new Date()), isNull(oauthTokens.revokedAt), isNull(apiKeys.revokedAt)))
    .limit(1);
  return row?.key ?? null;
}
