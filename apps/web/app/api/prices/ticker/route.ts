import { NextResponse } from "next/server";
import { fxTicker } from "@railor/core";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/prices/ticker — mid-market rates for the FX ticker, shared across viewers for 60s. */
export async function GET(request: Request) {
  if (!(await consumeLimit("fx-ticker", requestIdentity(request), 20, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return NextResponse.json({ rates: await fxTicker(), source: "Wise public rate (mid-market)" });
}
