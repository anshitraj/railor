import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureMigrated } from "@railor/database";
import { monitorDecisions } from "@railor/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (Buffer.byteLength(presented) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(presented), Buffer.from(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureMigrated();
  return NextResponse.json(await monitorDecisions({ limit: 25 }));
}
