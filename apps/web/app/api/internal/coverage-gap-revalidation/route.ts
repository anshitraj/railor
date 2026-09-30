import { NextResponse } from "next/server";
import { revalidateCoverageGaps } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";

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
  // Constant-time Bearer CRON_SECRET check shared by every scheduler hook.
  const denied = cronGuard(request);
  if (denied) return denied;

  await ensureMigrated();
  const summary = await revalidateCoverageGaps({ limit: 200 });

  return NextResponse.json({ ok: true, ...summary });
}

export { POST as GET };
