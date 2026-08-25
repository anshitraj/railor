import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findOrCreateUserByEmail, getSession, startSession } from "../../../../../../lib/auth";
import { createOrganizationForUser } from "../../../../../../lib/org";
import { completeOAuthExchange, isOAuthProvider } from "../../../../../../lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "railor_oauth";

/**
 * Mirrors what /auth/verify does for magic links: find-or-create the user by
 * email, start a session, create the workspace on a true first sign-in, and
 * land back on whatever the visitor was doing.
 */
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const url = new URL(request.url);

  if (!isOAuthProvider(provider)) {
    return NextResponse.redirect(new URL("/login?error=oauth_unsupported", url));
  }

  const stateCookie = (await cookies()).get(STATE_COOKIE)?.value;

  const clearState = (redirectUrl: URL) => {
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError) {
    return clearState(new URL("/login?error=oauth_denied", url));
  }
  if (!code || !state || !stateCookie) {
    return clearState(new URL("/login?error=oauth_state", url));
  }

  const [expectedState, encodedReturnTo] = stateCookie.split("|");
  if (!expectedState || state !== expectedState) {
    return clearState(new URL("/login?error=oauth_state", url));
  }
  const returnToRaw = encodedReturnTo ? decodeURIComponent(encodedReturnTo) : "/welcome";
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/welcome";

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? url.origin}/api/auth/oauth/${provider}/callback`;

  try {
    const profile = await completeOAuthExchange(provider, code, redirectUri);
    const user = await findOrCreateUserByEmail(profile.email, profile.name);
    if (!user) return clearState(new URL("/login?error=oauth_failed", url));

    await startSession(user.id);

    const session = await getSession();
    if (session && !session.organization) {
      await createOrganizationForUser(user.id, user.email);
    }

    return clearState(new URL(returnTo, url));
  } catch (error) {
    console.error(`[oauth:${provider}]`, error);
    return clearState(new URL("/login?error=oauth_failed", url));
  }
}
