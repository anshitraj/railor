import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { approveAuthorization, deniedRedirect, validateAuthorizeRequest } from "../../../lib/oauth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * The person's answer on the consent screen. It carries the original request
 * so nothing from the page is trusted: the client, redirect URI and PKCE
 * challenge are checked again here, and the call must come from this site.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return reply({ error: "Open this page from Railor." }, 403);
  const session = await getSession();
  if (!session?.organization) return reply({ error: "Sign in to a workspace first." }, 401);
  if (session.role !== "owner" && session.role !== "admin") return reply({ error: "Only a workspace owner or admin can connect an app. Ask one to approve it." }, 403);
  let body: { query?: unknown; decision?: unknown };
  try { body = await request.json(); } catch { return reply({ error: "Send JSON." }, 400); }
  if (typeof body.query !== "string" || body.query.length > 4_000) return reply({ error: "Missing request." }, 400);
  const params = Object.fromEntries(new URLSearchParams(body.query)) as Record<string, string>;
  const checked = await validateAuthorizeRequest(params);
  if (!checked.ok) return "show" in checked ? reply({ error: checked.show }, 400) : reply({ redirect: checked.redirect });
  if (body.decision !== "approve") return reply({ redirect: deniedRedirect(checked.request) });
  const result = await approveAuthorization({ request: checked.request, client: checked.client, organizationId: session.organization.id, userId: session.user.id });
  if (!result.ok) return reply({ error: result.description }, 409);
  return reply({ redirect: result.redirect });
}
