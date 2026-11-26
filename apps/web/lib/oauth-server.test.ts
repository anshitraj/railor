/** The whole sign-in flow a chat app uses, against a real (in-memory) database: register, approve, exchange, refresh, revoke. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...(await original<typeof import("@railor/database")>()), getDb: async () => state.db, ensureMigrated: async () => undefined }));
vi.mock("./auth", () => ({ hashApiKey: (value: string) => createHash("sha256").update(value).digest("hex") }));

const database = await import("@railor/database");
const oauth = await import("./oauth-server");
const { authenticate, ApiError } = await import("./api-auth");
const client = new PGlite();
let orgId = "";
let userId = "";

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const REDIRECT = "https://chatgpt.com/connector/oauth/callback";

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  const [org] = await state.db.insert(database.organizations).values({ name: "OAuth test", slug: "oauth-fixture" }).returning();
  orgId = org.id;
  const [user] = await state.db.insert(database.users).values({ email: "oauth-fixture@test.invalid" }).returning();
  userId = user.id;
}, 30000);
afterAll(async () => { await client.close(); });

async function register(redirectUris = [REDIRECT]) {
  const result = await oauth.registerClient({ client_name: "ChatGPT", redirect_uris: redirectUris });
  if (!result.ok) throw new Error(result.description);
  return result.client;
}
async function authorize(clientId: string, overrides: Record<string, string> = {}) {
  const checked = await oauth.validateAuthorizeRequest({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", ...overrides });
  if (!checked.ok) throw new Error(JSON.stringify(checked));
  const approved = await oauth.approveAuthorization({ request: checked.request, client: checked.client, organizationId: orgId, userId });
  if (!approved.ok) throw new Error(approved.description);
  const url = new URL(approved.redirect);
  return { code: url.searchParams.get("code")!, url };
}
const token = (params: Record<string, string>) => oauth.exchangeToken(new URLSearchParams(params));

describe("discovery and registration", () => {
  it("publishes the documents a client needs, and requires PKCE", () => {
    expect(oauth.authorizationServerMetadata()).toMatchObject({ code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], registration_endpoint: expect.stringContaining("/oauth/register") });
    expect(oauth.protectedResourceMetadata()).toMatchObject({ resource: expect.stringContaining("/api/mcp"), authorization_servers: [expect.any(String)] });
  });

  it("accepts https and loopback redirect addresses only", async () => {
    expect(["https://chatgpt.com/cb", "http://localhost:8123/callback", "http://127.0.0.1/cb"].every(oauth.validRedirectUri)).toBe(true);
    expect(["http://example.com/cb", "javascript:alert(1)", "https://user:pw@example.com/cb", "https://example.com/cb#frag", "claude://cb"].some(oauth.validRedirectUri)).toBe(false);
    expect(await oauth.registerClient({ redirect_uris: ["http://example.com/cb"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(await oauth.registerClient({})).toMatchObject({ ok: false });
  });

  it("checks PKCE in constant form: only the matching verifier passes", () => {
    expect(oauth.pkceMatches(verifier, challenge)).toBe(true);
    expect(oauth.pkceMatches(randomBytes(32).toString("base64url"), challenge)).toBe(false);
    expect(oauth.pkceMatches("short", challenge)).toBe(false);
  });
});

describe("authorization", () => {
  it("never redirects to an address the client didn't register, or for an unknown client", async () => {
    const registered = await register();
    expect(await oauth.validateAuthorizeRequest({ client_id: registered.id, redirect_uri: "https://evil.example/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" })).toMatchObject({ ok: false, show: expect.any(String) });
    expect(await oauth.validateAuthorizeRequest({ client_id: "rlc_unknown", redirect_uri: REDIRECT, response_type: "code" })).toMatchObject({ ok: false, show: expect.any(String) });
  });

  it("returns problems with the request itself to the client as OAuth errors", async () => {
    const registered = await register();
    const missingPkce = await oauth.validateAuthorizeRequest({ client_id: registered.id, redirect_uri: REDIRECT, response_type: "code", state: "s1" });
    expect(missingPkce).toMatchObject({ ok: false, redirect: expect.stringContaining("error=invalid_request") });
    const badScope = await oauth.validateAuthorizeRequest({ client_id: registered.id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", scope: "payments:write" });
    expect(badScope).toMatchObject({ ok: false, redirect: expect.stringContaining("error=invalid_scope") });
    const wrongResource = await oauth.validateAuthorizeRequest({ client_id: registered.id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", resource: "https://other.example/mcp" });
    expect(wrongResource).toMatchObject({ ok: false, redirect: expect.stringContaining("error=invalid_target") });
  });

  it("carries the state back, and a denial is a normal OAuth error", async () => {
    const registered = await register();
    const { url } = await authorize(registered.id);
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBeTruthy();
    const checked = await oauth.validateAuthorizeRequest({ client_id: registered.id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" });
    if (!checked.ok) throw new Error("expected a valid request");
    expect(new URL(oauth.deniedRedirect(checked.request)).searchParams.get("error")).toBe("access_denied");
  });
});

describe("tokens", () => {
  it("exchanges a code once, for tokens that authenticate the MCP endpoint, and meters through an identity key", async () => {
    const registered = await register();
    const { code } = await authorize(registered.id);
    const exchanged = await token({ grant_type: "authorization_code", code, client_id: registered.id, redirect_uri: REDIRECT, code_verifier: verifier });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "prices:read" });
    const access = exchanged.body.access_token as string;
    expect(access.startsWith("rlo_")).toBe(true);

    // The same code can't be used twice.
    expect((await token({ grant_type: "authorization_code", code, client_id: registered.id, redirect_uri: REDIRECT, code_verifier: verifier })).body).toMatchObject({ error: "invalid_grant" });

    // The token is the workspace's identity key on the MCP endpoint, and nowhere else.
    const context = await authenticate(new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${access}` } }), { oauth: true });
    expect(context).toMatchObject({ organizationId: orgId, mode: "test" });
    await expect(authenticate(new Request("http://localhost/v1/prices", { headers: { authorization: `Bearer ${access}` } }))).rejects.toBeInstanceOf(ApiError);
    const [key] = await state.db.select().from(database.apiKeys).where(eq(database.apiKeys.id, context.keyId));
    expect(key).toMatchObject({ label: "ChatGPT (OAuth)", prefix: "oauth", revealableSecret: null });
  });

  it("refuses a wrong verifier, another client's code and a changed redirect address", async () => {
    const a = await register();
    const b = await register();
    const first = await authorize(a.id);
    expect((await token({ grant_type: "authorization_code", code: first.code, client_id: a.id, redirect_uri: REDIRECT, code_verifier: randomBytes(32).toString("base64url") })).body).toMatchObject({ error: "invalid_grant" });
    const second = await authorize(a.id);
    expect((await token({ grant_type: "authorization_code", code: second.code, client_id: b.id, redirect_uri: REDIRECT, code_verifier: verifier })).body).toMatchObject({ error: "invalid_grant" });
    const third = await authorize(a.id);
    expect((await token({ grant_type: "authorization_code", code: third.code, client_id: a.id, redirect_uri: "https://chatgpt.com/other", code_verifier: verifier })).body).toMatchObject({ error: "invalid_grant" });
  });

  it("rotates refresh tokens: the old one stops working the moment a new pair exists", async () => {
    const registered = await register();
    const { code } = await authorize(registered.id);
    const first = (await token({ grant_type: "authorization_code", code, client_id: registered.id, redirect_uri: REDIRECT, code_verifier: verifier })).body;
    const refreshed = await token({ grant_type: "refresh_token", refresh_token: first.refresh_token as string, client_id: registered.id });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).not.toBe(first.access_token);
    expect((await token({ grant_type: "refresh_token", refresh_token: first.refresh_token as string, client_id: registered.id })).body).toMatchObject({ error: "invalid_grant" });
    // The previous access token no longer matches; the new one does.
    expect(await oauth.keyForAccessToken(first.access_token as string)).toBeNull();
    expect(await oauth.keyForAccessToken(refreshed.body.access_token as string)).not.toBeNull();
  });

  it("ends the grant when its identity key is revoked, and reuses one key across reconnects", async () => {
    const registered = await register();
    const run = async () => {
      const { code } = await authorize(registered.id);
      return (await token({ grant_type: "authorization_code", code, client_id: registered.id, redirect_uri: REDIRECT, code_verifier: verifier })).body;
    };
    const first = await run();
    const second = await run();
    const keyOf = async (access: string) => (await oauth.keyForAccessToken(access))!.id;
    expect(await keyOf(second.access_token as string)).toBe(await keyOf(first.access_token as string));

    const id = await keyOf(first.access_token as string);
    await state.db.update(database.apiKeys).set({ revokedAt: new Date() }).where(eq(database.apiKeys.id, id));
    expect(await oauth.keyForAccessToken(first.access_token as string)).toBeNull();
    expect((await token({ grant_type: "refresh_token", refresh_token: second.refresh_token as string, client_id: registered.id })).body).toMatchObject({ error: "invalid_grant" });
    await expect(authenticate(new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${second.access_token}` } }), { oauth: true })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects unknown grant types", async () => {
    expect((await token({ grant_type: "password", client_id: "x" })).body).toMatchObject({ error: "unsupported_grant_type" });
  });
});
