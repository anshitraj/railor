import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureMigrated, featureInterest, getDb } from "@railor/database";
import { companyDomain, getSession } from "../../../lib/auth";
import { consumeLimit, requestIdentity } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Roadmap features a visitor can ask to hear about. A fixed list, so the table can't collect arbitrary strings. */
const NOTIFY_FEATURES = [
  "connections",
  "benchmarks",
  "unified-api",
  "orchestration",
  "alerts-slack",
  "alerts-webhook",
  "provider_connection",
  "execution",
] as const;

const Body = z.object({
  feature: z.enum(NOTIFY_FEATURES),
  email: z.string().trim().email().max(320).optional(),
  providerRequested: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,100}$/).optional(),
});

/** "Notify me" for surfaces labelled Coming soon. Signed-in users need no input at all. */
export async function POST(request: Request) {
  if (!(await consumeLimit("notify", requestIdentity(request), 20, 3_600_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  await ensureMigrated();
  const session = await getSession();
  const isAccessRequest = parsed.data.feature === "provider_connection" || parsed.data.feature === "execution";
  if (isAccessRequest && (!session?.organization || !parsed.data.providerRequested)) {
    return NextResponse.json({ error: "workspace_and_provider_required" }, { status: 400 });
  }
  const email = (isAccessRequest ? parsed.data.email ?? session?.user.email : session?.user.email ?? parsed.data.email)?.toLowerCase();
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  // A signed-in freelancer may use a personal-domain contact for a connection request.
  if (parsed.data.feature === "execution" && !companyDomain(email)) return NextResponse.json({ error: "work_email_required" }, { status: 400 });

  const db = await getDb();
  await db
    .insert(featureInterest)
    .values({
      feature: parsed.data.feature,
      email,
      userId: session?.user.id ?? null,
      organizationId: session?.organization?.id ?? null,
      providerRequested: isAccessRequest ? parsed.data.providerRequested : null,
    })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
