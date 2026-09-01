import { NextResponse } from "next/server";
import { checkDueSources } from "@railor/core";
import { ensureMigrated } from "@railor/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cheap, no-LLM source monitoring job — see packages/core/src/source-monitor.ts.
 * Same pattern as /api/internal/usage-rollup: an external scheduler calls
 * this (none wired up yet), gated by the same CRON_SECRET.
 *
 * Deliberately does not do anything beyond a conditional GET + hash compare
 * per source. A changed source produces a pending change_event for a human
 * (or a future targeted-extraction step) to act on — it never re-runs
 * extraction or touches a live capability/route row itself.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (presented !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureMigrated();
  const summary = await checkDueSources({ limit: 100, concurrency: 4 });

  return NextResponse.json({ ok: true, ...summary });
}

// Vercel Cron only issues GET requests, and injects `Authorization: Bearer
// $CRON_SECRET` automatically when the target path is listed in vercel.json's
// `crons` — so GET needs to do exactly what POST does, not a separate route.
export { POST as GET };
