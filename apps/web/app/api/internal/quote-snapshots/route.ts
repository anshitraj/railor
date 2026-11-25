import { NextResponse } from "next/server";
import { ensureMigrated } from "@railor/database";
import { cronGuard } from "../../../../lib/cron";
import { resolvePriceInput, runPriceCheck } from "../../../../lib/pricing";
import { recordPriceCheck } from "../../../../lib/quote-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Prices Railor's busiest corridors once a day at a standard amount, so their
 * history charts have a point every day even when nobody checked them. Each
 * check records the public quotes it found; prices themselves come only from
 * the same sources a visitor's check uses.
 */
const CORRIDORS: Array<[string, string]> = [
  ["USD", "INR"], ["GBP", "INR"], ["EUR", "INR"], ["AED", "INR"], ["CAD", "INR"], ["AUD", "INR"], ["SGD", "INR"],
  ["USD", "PKR"], ["USD", "PHP"], ["USD", "MXN"], ["USD", "NGN"], ["GBP", "EUR"], ["USD", "EUR"],
];
const AMOUNT = 1_000;

export async function POST(request: Request) {
  const denied = cronGuard(request);
  if (denied) return denied;
  await ensureMigrated();
  const started = Date.now();
  let checked = 0;
  let recorded = 0;
  const failed: string[] = [];
  for (const [from, to] of CORRIDORS) {
    if (Date.now() - started > 240_000) break;
    try {
      // The same input a signed-out visitor's check for this pair resolves to.
      const input = await resolvePriceInput({ from, to, amount: String(AMOUNT) }, null, "personal");
      const result = await runPriceCheck(null, {
        sourceCurrency: input.from, destinationCurrency: input.to, destinationCountry: input.destinationCountry, amount: input.amount, includeMarket: input.market, context: input.context,
      });
      // Recorded here directly too, since `after()` work may not finish inside a cron invocation.
      recorded += await recordPriceCheck({ ...result.input, profile: "personal" }, result.rows, result.reference?.rate ?? null);
      checked += 1;
    } catch {
      failed.push(`${from}-${to}`);
    }
  }
  console.log(JSON.stringify({ event: "quote_snapshots_recorded", checked, recorded, failed }));
  return NextResponse.json({ ok: true, checked, recorded, failed });
}

export { POST as GET };
