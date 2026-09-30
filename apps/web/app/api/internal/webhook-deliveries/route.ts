import { NextResponse } from "next/server";
import { deliverDueWebhooks } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Scheduler hook (every minute): retries due outbound webhook deliveries with backoff. */
export async function POST(request: Request) {
  const denied = cronGuard(request);
  if (denied) return denied;
  await ensureMigrated();
  return NextResponse.json(await deliverDueWebhooks({ limit: 200 }));
}
