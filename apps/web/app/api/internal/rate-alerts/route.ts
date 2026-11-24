import { NextResponse } from "next/server";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";
import { checkRateAlerts } from "../../../../lib/rate-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rate-alert checker: re-prices the least recently checked alerts and emails
 * anyone whose target was reached. Vercel Cron runs it daily (the Hobby limit);
 * any scheduler with CRON_SECRET can call it more often.
 */
export async function POST(request: Request) {
  const denied = cronGuard(request);
  if (denied) return denied;
  await ensureMigrated();
  const run = await checkRateAlerts({ budgetMs: 240_000 });
  console.log(JSON.stringify({ event: "rate_alerts_checked", ...run }));
  return NextResponse.json({ ok: true, ...run });
}

export { POST as GET };
