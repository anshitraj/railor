import { NextResponse } from "next/server";
import { cached } from "../../../../lib/cache";
import { loadRateHistory, type HistoryRequest } from "../../../../lib/rate-history";
import { NETWORKS } from "../../../../lib/stablecoin-routes";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const mode = p.get("mode") ?? "bank";
  const from = p.get("from")?.toUpperCase() ?? "";
  const to = p.get("to")?.toUpperCase() ?? "";
  const network = p.get("network") ?? undefined;
  const provider = p.get("provider") ?? undefined;
  if (!/^[A-Z]{3,4}$/.test(from) || !/^[A-Z]{3,4}$/.test(to) || from === to || !["bank", "stablecoin"].includes(mode) ||
    (mode === "bank" && (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to))) ||
    (mode === "stablecoin" && (!["USDT", "USDC"].includes(from) || !["INR", "EURC"].includes(to))) ||
    (network && !Object.hasOwn(NETWORKS, network)) || (provider && !/^[a-z0-9-]{1,64}$/.test(provider))) {
    return NextResponse.json({ error: "Choose a supported currency pair." }, { status: 400 });
  }
  if (!await consumeLimit("rate-history", requestIdentity(request), 60, 60_000)) return NextResponse.json({ error: "Too many history requests. Try again in a minute." }, { status: 429 });
  const input: HistoryRequest = { mode: mode as HistoryRequest["mode"], from, to, provider, network };
  try {
    const day = new Date().toISOString().slice(0, 10);
    const data = await cached(`rate-history:${day}:${mode}:${from}:${to}:${provider ?? "market"}:${network ?? "fiat"}`, 15 * 60_000, () => loadRateHistory(input));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "Historical rates are temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
