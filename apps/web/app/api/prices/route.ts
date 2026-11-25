import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { parsePriceQuery, runPriceCheck } from "../../../lib/pricing";
import { consumeLimit, requestIdentity } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * GET /api/prices?from=USD&to=INR&amount=1000[&market=1] — the live quote
 * widget's poll. Guests receive public prices. A workspace can also see
 * exact quotes from its own connected accounts.
 */
export async function GET(request: Request) {
  const input = parsePriceQuery(new URL(request.url).searchParams);
  if (!input) return NextResponse.json({ error: "Pick two different currencies and an amount above zero." }, { status: 400 });
  const session = await getSession();
  const org = session?.organization?.id ?? null;
  const allowed = await consumeLimit("prices", org ? `org:${org}` : requestIdentity(request), org ? 120 : 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Too many price checks — try again in a minute." }, { status: 429 });
  try {
    const result = await runPriceCheck(org, input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Price comparison is temporarily unavailable. Please try again shortly." }, { status: 502 });
  }
}
