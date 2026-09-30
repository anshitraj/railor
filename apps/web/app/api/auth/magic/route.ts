import { NextResponse } from "next/server";
import { z } from "zod";
import { createMagicLink } from "../../../../lib/auth";
import { sendMail } from "../../../../lib/mail";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  returnTo: z.string().max(500).optional(),
});

/**
 * Issues a magic link. With AUTH_EMAIL_TRANSPORT=console (the development
 * default) the link is returned in the response and logged, so a fresh clone
 * can sign in without an SMTP account. It is clearly labelled as such.
 */
export async function POST(request: Request) {
  const transport = process.env.AUTH_EMAIL_TRANSPORT ?? "console";
  if (process.env.NODE_ENV === "production" && transport === "console") {
    return NextResponse.json({ error: "email_unavailable" }, { status: 503 });
  }
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

  const result = await sendMail({
    to: parsed.data.email,
    subject: "Sign in to Railor",
    text: `Sign in to Railor: ${url}\n\nThis link expires in 20 minutes.`,
    html: `<p><a href="${url}">Sign in to Railor</a></p><p>This link expires in 20 minutes.</p>`,
  });

  if (!result.sent) {
    return NextResponse.json({ sent: false, error: "email_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ sent: true, transport });
}
