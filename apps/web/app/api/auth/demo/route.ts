import { NextResponse } from "next/server";
import { provisionDemoSession } from "../../../../lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One click into a fully populated workspace, no email required. See
 * lib/demo.ts for why this resets the shared demo org on every visit rather
 * than handing out a fresh empty one.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(request.url);
  try {
    await provisionDemoSession();
  } catch (error) {
    console.error("[demo]", error);
    return NextResponse.redirect(new URL("/login?error=demo_failed", url));
  }
  return NextResponse.redirect(new URL("/app", url));
}
