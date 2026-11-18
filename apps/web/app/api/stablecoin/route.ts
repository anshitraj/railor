import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { consumeLimit, requestIdentity } from "../../../lib/rate-limit";
import { indiaExchangeQuotes } from "../../../lib/india-exchanges";
import { NETWORKS, type Network, type Stablecoin } from "../../../lib/stablecoin-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stablecoin?asset=USDT&network=ethereum&amount=1000 — live INR sell
 * quotes from Indian exchanges' public order books. Like every price on
 * Railor, the amounts are for signed-in accounts: a visitor learns which
 * exchanges were checked and whether they take that network, never a number.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const asset = params.get("asset")?.toUpperCase();
  const network = params.get("network") ?? "";
  const amount = Number(params.get("amount"));
  if ((asset !== "USDT" && asset !== "USDC") || !Object.hasOwn(NETWORKS, network) || !(amount > 0) || amount > 10_000_000) {
    return NextResponse.json({ error: "Pick USDT or USDC, a network and an amount above zero." }, { status: 400 });
  }
  const session = await getSession();
  const org = session?.organization?.id ?? null;
  const allowed = await consumeLimit("stablecoin", org ? `org:${org}` : requestIdentity(request), org ? 120 : 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Too many price checks. Try again in a minute." }, { status: 429 });

  const quotes = await indiaExchangeQuotes(asset as Stablecoin, network as Network, amount);
  if (!session) {
    return NextResponse.json({
      locked: true,
      exchanges: quotes
        .map(({ slug, name, support, status }) => ({ slug, name, support, status }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return NextResponse.json({ locked: false, exchanges: quotes });
}
