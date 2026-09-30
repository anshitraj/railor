import { NextResponse } from "next/server";
import { claimConnectorJob, completeConnectorJob } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!await consumeLimit("connector-poll", requestIdentity(request), 120, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  try {
    await ensureMigrated();
    const body = await request.json();
    const result = body.action === "poll" ? await claimConnectorJob(token) : body.action === "receipt" ? await completeConnectorJob(token, body.receipt) : undefined;
    if (result === undefined) return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "invalid_connector_token";
    return NextResponse.json({ error: unauthorized ? "unauthorized" : "connector_request_failed" }, { status: unauthorized ? 401 : 409 });
  }
}
