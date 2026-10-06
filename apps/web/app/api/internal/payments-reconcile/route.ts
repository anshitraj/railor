import { NextResponse } from "next/server";
import { reconcileOpenPayments, watchCompletedForReturns } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Scheduler hook (every minute is a good default): asks each provider about
 * every open payment — submitted, awaiting funds, processing or unknown — and
 * applies what it reports. Unknown outcomes are resolved by replaying the
 * original request under its original idempotency key, never by re-routing.
 */
export async function POST(request: Request) {
  const denied = cronGuard(request);
  if (denied) return denied;
  await ensureMigrated();
  const results = [...(await reconcileOpenPayments({ limit: 100 })), ...(await watchCompletedForReturns({ limit: 50 }))];
  const tally = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
  return NextResponse.json({ checked: results.length, outcomes: tally });
}
