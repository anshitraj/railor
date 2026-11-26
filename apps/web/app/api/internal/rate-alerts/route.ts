import { NextResponse } from "next/server";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";
import { checkEmailSubscriptions } from "../../../../lib/email-subscriptions";
import { checkRateAlerts } from "../../../../lib/rate-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rate-update sender: re-prices the least recently checked alerts and emails
 * the daily, weekly and smart updates that are due, for signed-in people and for
 * confirmed email addresses. Vercel Cron runs it daily (the Hobby limit); any
 * scheduler with CRON_SECRET can call it more often.
 */
export async function POST(request: Request) {
  const denied = cronGuard(request);
  if (denied) return denied;
  await ensureMigrated();
  const run = await checkRateAlerts({ budgetMs: 150_000 });
  const subscriptions = await checkEmailSubscriptions({ budgetMs: 120_000 });
  console.log(JSON.stringify({ event: "rate_alerts_checked", ...run, subscriptions }));
  return NextResponse.json({ ok: true, ...run, subscriptions });
}

export { POST as GET };
