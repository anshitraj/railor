import { NextResponse } from "next/server";
import { pruneApiUsage, rollupApiUsageDay } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily usage rollup + retention job, meant to be called by an external
 * scheduler (Vercel Cron, a GitHub Actions schedule, cron on a worker box —
 * none is wired up yet, this route is the hook for one). Rolls up
 * yesterday's api_usage into api_usage_daily, then prunes raw rows older
 * than 14 days.
 *
 * Requires CRON_SECRET to be set; without it the route refuses to run
 * rather than being an open unauthenticated write endpoint.
 */
export async function POST(request: Request) {
  // Constant-time Bearer CRON_SECRET check shared by every scheduler hook.
  const denied = cronGuard(request);
  if (denied) return denied;

  await ensureMigrated();
  const yesterday = new Date(Date.now() - 86_400_000);
  const rollup = await rollupApiUsageDay(yesterday);
  const pruned = await pruneApiUsage(14);

  return NextResponse.json({ ok: true, rollup, pruned });
}

// Vercel Cron only issues GET requests, and injects `Authorization: Bearer
// $CRON_SECRET` automatically when the target path is listed in vercel.json's
// `crons` — so GET needs to do exactly what POST does, not a separate route.
export { POST as GET };
