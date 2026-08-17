import { NextResponse } from "next/server";
import { z } from "zod";
import { createMagicLink } from "../../../../lib/auth";

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
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const { url } = await createMagicLink(parsed.data.email, parsed.data.returnTo);
  const transport = process.env.AUTH_EMAIL_TRANSPORT ?? "console";

  if (transport === "console") {
    console.log(`\n▸ Railor sign-in link for ${parsed.data.email}:\n  ${url}\n`);
    return NextResponse.json({ sent: true, devLink: url, transport });
  }

  // SMTP delivery is provided by the mail adapter; until one is configured we
  // say so instead of pretending the mail was sent.
  return NextResponse.json(
    { sent: false, error: "mail_transport_not_configured", transport },
    { status: 501 },
  );
}
