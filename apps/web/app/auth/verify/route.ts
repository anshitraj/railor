import { NextResponse } from "next/server";
import { consumeMagicLink, getSession } from "../../../lib/auth";
import { createOrganizationForUser } from "../../../lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consumes a magic link, creates the workspace on first sign-in, and returns
 * the visitor to whatever they were doing — the question they typed before
 * signing up is never lost.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=missing_token", url));

  const result = await consumeMagicLink(token);
  if (!result) return NextResponse.redirect(new URL("/login?error=expired", url));

  const session = await getSession();
  if (session && !session.organization) {
    await createOrganizationForUser(result.user.id, result.user.email);
  }

  const returnTo = result.returnTo && result.returnTo.startsWith("/") ? result.returnTo : "/welcome";
  return NextResponse.redirect(new URL(returnTo, url));
}
