import { NextResponse } from "next/server";
import { revalidateCoverageGaps } from "@railor/core";
import { ensureMigrated } from "@railor/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coverage-gap revalidation job — see packages/core/src/coverage-gaps.ts.
 * Same pattern as /api/internal/usage-rollup and /api/internal/source-monitor:
 * an external scheduler calls this (none wired up yet), gated by CRON_SECRET.
 *
 * Re-runs every open gap's stored query against current provider data. A gap
 * that's no longer unknown gets one pending change_event — a human still
 * reviews it in the admin queue before any watcher is actually notified,
 * same as every other change_event in Railor.
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
  const summary = await revalidateCoverageGaps({ limit: 200 });

  return NextResponse.json({ ok: true, ...summary });
}

export { POST as GET };
