import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { parsePriceQuery, runPriceCheck } from "../../../lib/pricing";
import { consumeLimit, requestIdentity } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/prices?from=USD&to=INR&amount=1000[&market=1] — the live quote
 * widget's poll. Anyone gets public and published prices; a signed-in
 * workspace also gets its own connected accounts' exact quotes.
 */
export async function GET(request: Request) {
  const input = parsePriceQuery(new URL(request.url).searchParams);
  if (!input) return NextResponse.json({ error: "Pick two different currencies and an amount above zero." }, { status: 400 });
  const session = await getSession();
  const org = session?.organization?.id ?? null;
  const allowed = await consumeLimit("prices", org ? `org:${org}` : requestIdentity(request), org ? 120 : 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Too many price checks — try again in a minute." }, { status: 429 });
  try {
    return NextResponse.json(await runPriceCheck(org, input));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Price check failed." }, { status: 502 });
  }
}
