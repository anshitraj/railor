import { appOrigin } from "../../../lib/security";
import { consumeLimit } from "../../../lib/rate-limit";
import { CORS, OAUTH_SCOPE, registerClient } from "../../../lib/oauth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ip = (request: Request) => (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

/** RFC 7591 dynamic client registration: chat apps register themselves, as public PKCE clients. */
export async function POST(request: Request) {
  if (!(await consumeLimit("oauth-register", ip(request), 30, 3_600_000))) return json({ error: "temporarily_unavailable", error_description: "Too many registrations from this address. Try again later." }, 429);
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: "invalid_client_metadata", error_description: "Send a JSON object." }, 400); }
  const result = await registerClient(body);
  if (!result.ok) return json({ error: result.error === "invalid_redirect_uri" ? "invalid_redirect_uri" : "invalid_client_metadata", error_description: result.description }, 400);
  const { client } = result;
  return json({
    client_id: client.id, client_name: client.name, redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    scope: OAUTH_SCOPE, client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    registration_client_uri: undefined, issuer: appOrigin(),
  }, 201);
}
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
