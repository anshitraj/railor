import { consumeLimit } from "../../../lib/rate-limit";
import { CORS, exchangeToken } from "../../../lib/oauth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" };
const ip = (request: Request) => (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";

/** Exchanges a code (with its PKCE verifier) or a refresh token for an access token. */
export async function POST(request: Request) {
  if (!(await consumeLimit("oauth-token", ip(request), 300, 60_000))) {
    return Response.json({ error: "temporarily_unavailable", error_description: "Too many requests. Slow down." }, { status: 429, headers: NO_STORE });
  }
  const text = await request.text();
  if (text.length > 8_000) return Response.json({ error: "invalid_request", error_description: "Request too large." }, { status: 413, headers: NO_STORE });
  const type = request.headers.get("content-type") ?? "";
  let form: URLSearchParams;
  try {
    form = type.includes("application/json") ? new URLSearchParams(Object.entries(JSON.parse(text) as Record<string, string>).map(([k, v]) => [k, String(v)])) : new URLSearchParams(text);
  } catch { return Response.json({ error: "invalid_request", error_description: "Send form-encoded parameters." }, { status: 400, headers: NO_STORE }); }
  const { status, body } = await exchangeToken(form);
  return Response.json(body, { status, headers: NO_STORE });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
