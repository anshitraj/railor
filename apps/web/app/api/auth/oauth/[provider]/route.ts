import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl, isOAuthConfigured, isOAuthProvider } from "../../../../../lib/oauth";
import { appOrigin, safeReturnPath } from "../../../../../lib/security";
import { consumeLimit, requestIdentity } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "railor_oauth";
const STATE_MINUTES = 10;

/**
 * Kicks off the provider redirect. State and the post-login destination
 * travel together in one short-lived cookie so the callback can verify the
 * request round-tripped through the real provider before trusting either.
 */
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const url = new URL(request.url);

  if (!isOAuthProvider(provider)) {
    return NextResponse.redirect(new URL("/login?error=oauth_unsupported", url));
  }
  if (!isOAuthConfigured(provider)) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", url));
  }

  if (!await consumeLimit("oauth-login", requestIdentity(request), 20, 900_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const returnToParam = url.searchParams.get("returnTo");
  const returnTo = safeReturnPath(returnToParam);

  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${appOrigin()}/api/auth/oauth/${provider}/callback`;

  const response = NextResponse.redirect(buildAuthorizeUrl(provider, redirectUri, state));
  response.cookies.set(STATE_COOKIE, `${provider}|${state}|${Date.now()}|${encodeURIComponent(returnTo)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MINUTES * 60,
  });
  return response;
}
