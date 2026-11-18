import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { consumeLimit, requestIdentity } from "../../../lib/rate-limit";
import { indiaExchangeQuotes } from "../../../lib/india-exchange-quotes";
import { stablecoinCashOutQuote } from "../../../lib/stablecoin-cash-out-quotes";
import { NETWORKS, isCashOutCurrency, type Network } from "../../../lib/stablecoin-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live sell estimates from public exchange data. INR is the default; other
 * supported bank currencies use the Kraken order book and published rail fees.
 * Amounts are available to signed-in accounts.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const asset = params.get("asset")?.toUpperCase();
  const network = params.get("network") ?? "";
  const amount = Number(params.get("amount"));
  const destination = params.get("dest")?.toUpperCase() ?? "INR";
  if (destination !== "INR" && !isCashOutCurrency(destination)) {
    return NextResponse.json({ error: "Pick a supported bank currency." }, { status: 400 });
  }
  if ((asset !== "USDT" && asset !== "USDC") || !Object.hasOwn(NETWORKS, network) || !(amount > 0) || amount > 10_000_000) {
    return NextResponse.json({ error: "Pick USDT or USDC, a network and an amount above zero." }, { status: 400 });
  }
  const session = await getSession();
  const org = session?.organization?.id ?? null;
  const allowed = await consumeLimit("stablecoin", org ? `org:${org}` : requestIdentity(request), org ? 120 : 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Too many price checks. Try again in a minute." }, { status: 429 });

  if (isCashOutCurrency(destination)) {
    if (!session) return NextResponse.json({ locked: true });
    return NextResponse.json(await stablecoinCashOutQuote(asset, network as Network, destination, amount));
  }

  const { quotes, reference } = await indiaExchangeQuotes(asset, network as Network, amount);
  if (!session) {
    return NextResponse.json({
      locked: true,
      exchanges: quotes
        .map(({ slug, name, support, status }) => ({ slug, name, support, status }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return NextResponse.json({ locked: false, exchanges: quotes, reference });
}
