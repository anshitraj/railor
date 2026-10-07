import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { findOrCreateUserByEmail, getSession, startSession } from "../../../../../../lib/auth";
import { createOrganizationForUser } from "../../../../../../lib/org";
import { completeOAuthExchange, isOAuthProvider } from "../../../../../../lib/oauth";
import { appOrigin, safeReturnPath, signInDestination } from "../../../../../../lib/security";

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

  const [expectedProvider, expectedState, issuedAt, encodedReturnTo] = stateCookie.split("|");
  const age = Date.now() - Number(issuedAt);
  if (provider !== expectedProvider || !expectedState || !Number.isFinite(age) || age < 0 || age > 600_000 ||
      Buffer.byteLength(state) !== Buffer.byteLength(expectedState) || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
    return clearState(new URL("/login?error=oauth_state", url));
  }
  let returnTo = "/welcome";
  try { returnTo = safeReturnPath(encodedReturnTo ? decodeURIComponent(encodedReturnTo) : null); } catch { /* invalid destination falls back */ }

  const redirectUri = `${appOrigin()}/api/auth/oauth/${provider}/callback`;
  (await cookies()).delete(STATE_COOKIE);

  try {
    const profile = await completeOAuthExchange(provider, code, redirectUri);
    const user = await findOrCreateUserByEmail(profile.email, profile.name);
    if (!user) return clearState(new URL("/login?error=oauth_failed", url));

    await startSession(user.id);

    const session = await getSession();
    if (session && !session.organization && !returnTo.startsWith("/invite/")) {
      await createOrganizationForUser(user.id, user.email);
    }

    return clearState(new URL(signInDestination(returnTo, Boolean(session?.organization?.onboardingCompletedAt)), appOrigin()));
  } catch (error) {
    console.error(JSON.stringify({ event: "oauth_failed", provider, errorType: error instanceof Error ? error.name : "UnknownError" }));
    return clearState(new URL("/login?error=oauth_failed", url));
  }
}
