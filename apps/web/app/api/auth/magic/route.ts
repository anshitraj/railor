import { NextResponse } from "next/server";
import { z } from "zod";
import { createMagicLink } from "../../../../lib/auth";
import { sendMail, smtpConfigured } from "../../../../lib/mail";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";
import { createSignInEmail } from "../../../../lib/emails/sign-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  returnTo: z.string().max(500).optional(),
});

/**
 * Issues a magic link. With AUTH_EMAIL_TRANSPORT=console (the development
 * default) the link is returned in the response and logged, so a fresh clone
 * can sign in without an SMTP account. It is clearly labelled as such.
 */
export async function POST(request: Request) {
  const transport = process.env.AUTH_EMAIL_TRANSPORT ?? "console";
  if (!["console", "smtp"].includes(transport) ||
      (process.env.NODE_ENV === "production" && transport === "console") ||
      (transport === "smtp" && !smtpConfigured())) {
    return NextResponse.json({ error: "email_unavailable" }, { status: 503 });
  }
  try {
    return await issueLink(request, transport);
  } catch (error) {
    console.error(JSON.stringify({ event: "sign_in_failed", errorType: error instanceof Error ? error.name : "UnknownError" }));
    return NextResponse.json({ error: "sign_in_unavailable" }, { status: 503 });
  }
}

async function issueLink(request: Request, transport: string) {
  if (!await consumeLimit("magic-ip", requestIdentity(request), 10, 900_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  if (!await consumeLimit("magic-email", parsed.data.email.trim().toLowerCase(), 3, 900_000)) {
    return NextResponse.json({ sent: true });
  }
  const { url } = await createMagicLink(parsed.data.email, parsed.data.returnTo);

  if (transport === "console") {
    console.log(`\n▸ Railor sign-in link for ${parsed.data.email}:\n  ${url}\n`);
    return NextResponse.json({ sent: true, devLink: url, transport });
  }

  const result = await sendMail(createSignInEmail(parsed.data.email, url));

  if (!result.sent) {
    return NextResponse.json({ sent: false, error: "email_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ sent: true, transport });
}
