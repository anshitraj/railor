import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl, isOAuthConfigured, isOAuthProvider } from "../../../../../lib/oauth";

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

  const returnToParam = url.searchParams.get("returnTo");
  const returnTo = returnToParam && returnToParam.startsWith("/") ? returnToParam : "/welcome";

  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? url.origin}/api/auth/oauth/${provider}/callback`;

  const response = NextResponse.redirect(buildAuthorizeUrl(provider, redirectUri, state));
  response.cookies.set(STATE_COOKIE, `${state}|${encodeURIComponent(returnTo)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MINUTES * 60,
  });
  return response;
}
