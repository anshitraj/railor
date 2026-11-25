import { NextResponse } from "next/server";
import { cached } from "../../../../lib/cache";
import { PROVIDER_HISTORY_RANGES, loadProviderHistory } from "../../../../lib/provider-history";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recorded provider quotes per day for one pair and amount, beside the mid-market value. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const from = p.get("from")?.toUpperCase() ?? "";
  const to = p.get("to")?.toUpperCase() ?? "";
  const amount = Number(p.get("amount"));
  const profile = ["personal", "freelancer", "business"].find((value) => value === p.get("profile")) ?? "personal";
  const days = PROVIDER_HISTORY_RANGES.find((value) => String(value) === (p.get("days") ?? "30"));
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to || !days || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    return NextResponse.json({ error: "Choose a supported currency pair and amount." }, { status: 400 });
  }
  if (!await consumeLimit("provider-history", requestIdentity(request), 60, 60_000)) return NextResponse.json({ error: "Too many history requests. Try again in a minute." }, { status: 429 });
  try {
    const day = new Date().toISOString().slice(0, 10);
    const rounded = Math.round(amount * 100) / 100;
    const data = await cached(`provider-history:${day}:${from}:${to}:${rounded}:${profile}:${days}`, 2 * 60_000, () => loadProviderHistory({ from, to, amount: rounded, profile, days }));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "Price history is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
