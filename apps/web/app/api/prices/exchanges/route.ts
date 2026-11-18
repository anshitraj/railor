import { NextResponse } from "next/server";
import { usdtInrExchangeRates } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { consumeLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/prices/exchanges — each Indian exchange's live USDT/INR bid, read
 * from its own public endpoint, with the gap to Wise's mid-market USD/INR rate.
 * Prices are for signed-in accounts (free): a signed-out request gets a 401 and
 * no number. The bids are market references, not quotes, and are shared across
 * viewers for 15s, so polling costs the exchanges next to nothing. An exchange
 * whose feed is down or fails Railor's checks comes back as "unavailable" with
 * the reason; the route itself does not fail because of one.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to see live exchange prices." }, { status: 401, headers: PRIVATE });
  if (!(await consumeLimit("exchange-bids", `user:${session.user.id}`, 60, 60_000))) {
    return NextResponse.json({ error: "Too many price checks — try again in a minute." }, { status: 429, headers: PRIVATE });
  }
  try {
    return NextResponse.json(await usdtInrExchangeRates(), { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "Live exchange prices are temporarily unavailable. Please try again shortly." }, { status: 502, headers: PRIVATE });
  }
}
