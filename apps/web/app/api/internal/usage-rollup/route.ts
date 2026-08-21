import { NextResponse } from "next/server";
import { pruneApiUsage, rollupApiUsageDay } from "@railor/core";
import { ensureMigrated } from "@railor/database";

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
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (presented !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureMigrated();
  const yesterday = new Date(Date.now() - 86_400_000);
  const rollup = await rollupApiUsageDay(yesterday);
  const pruned = await pruneApiUsage(14);

  return NextResponse.json({ ok: true, rollup, pruned });
}
