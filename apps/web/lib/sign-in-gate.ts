import { redirect } from "next/navigation";
import { getSession } from "./auth";

/**
 * Pages that hold Railor's provider data are for people with an account, so a
 * script (or an AI agent) cannot read the whole directory without signing in.
 * A visitor is sent to sign in and comes straight back to where they were going.
 */
export async function requireSignedIn(returnTo: string) {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}
