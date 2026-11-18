import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "../../../lib/auth";
import { runPriceCheck } from "../../../lib/pricing";
import { priceView } from "../../../lib/price-view";
import { benchmarkCost } from "../../../lib/price-cost";
import { pricingSourceLabel } from "../../../lib/price-display";
import { consumeLimit } from "../../../lib/rate-limit";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";
import { PAYROLL_MAX_ROWS, type PayrollQuote } from "../../../lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sourceCurrency: z.string().regex(/^[A-Z]{3}$/),
  payouts: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]{1,12}$/i),
    amount: z.number().positive().max(10_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  })).min(1).max(PAYROLL_MAX_ROWS),
});

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Prices each payroll payout. Only an opaque id, the amount, the currency and
 * the country arrive here; names and employee IDs stay in the browser.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return error("Open payroll pricing from Railor.", 403);
  const session = await getSession();
  if (!session?.organization) return error("Sign in to a workspace first.", 401);
  const org = session.organization;
  if (!isCompanyWorkspace(org.building)) return error("Payroll pricing is part of the company workspace. Switch your workspace to Company to use it.", 403);
  const text = await request.text();
  if (text.length > 20_000) return error("Send up to 50 payouts at a time.", 413);
  let body: z.infer<typeof Body>;
  try { body = Body.parse(JSON.parse(text)); } catch { return error("Send up to 50 payouts, each with an amount above zero and a 3-letter currency.", 400); }
  if (!(await consumeLimit("payroll", org.id, 20, 3_600_000))) return error("You’ve priced a lot of payroll this hour. Try again in a little while.", 429);

  const now = Date.now();
  const memo = new Map<string, Promise<Omit<PayrollQuote, "id">>>();
  const price = (payout: z.infer<typeof Body>["payouts"][number]): Promise<Omit<PayrollQuote, "id">> => {
    if (payout.currency === body.sourceCurrency) return Promise.resolve({ status: "same_currency", reason: "Same currency as you pay from, so there’s no conversion to compare." });
    const key = `${payout.currency}:${payout.country ?? ""}:${payout.amount}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const work = (async (): Promise<Omit<PayrollQuote, "id">> => {
      try {
        const result = await runPriceCheck(org.id, {
          sourceCurrency: body.sourceCurrency, destinationCurrency: payout.currency, destinationCountry: payout.country ?? undefined, amount: payout.amount, includeMarket: false,
          context: { profile: "business", country: org.entityCountry ?? "US", direction: "send", purpose: "salary" },
        });
        const view = priceView(result, now);
        const best = view.best;
        if (!best || best.recipientAmount === null) {
          // No complete price: show the highest figure as an estimate, with what's unconfirmed — never as the best price.
          const top = view.quotes.filter((row) => row.recipientAmount !== null).sort((a, b) => b.recipientAmount! - a.recipientAmount!)[0];
          if (!top) return { status: "no_price", reason: result.unavailable[0]?.reason ?? "No price for this payout yet.", reference: result.reference };
          return {
            status: "estimate",
            reason: top.missing?.[0] ?? top.profileAssessment?.reasons[0] ?? "A cost or your eligibility is unconfirmed.",
            best: { provider: top.providerName, product: top.product?.label ?? null, recipientAmount: top.recipientAmount!, dataStatus: pricingSourceLabel(top), costMinor: null, bps: null },
            options: view.quotes.length, spread: null, spreadInSource: null, reference: result.reference,
          };
        }
        const comparable = view.quotes.filter((row) => row.recipientAmount !== null && !row.partial && row.costComplete !== false);
        const least = comparable.reduce((low, row) => (row.recipientAmount! < low.recipientAmount! ? row : low), best);
        const spread = comparable.length > 1 ? round(best.recipientAmount - least.recipientAmount!) : null;
        const cost = benchmarkCost(best, payout.amount, result.reference?.rate, payout.currency);
        return {
          status: "priced",
          best: { provider: best.providerName, product: best.product?.label ?? null, recipientAmount: best.recipientAmount, dataStatus: pricingSourceLabel(best), costMinor: cost.kind === "cost" ? cost.costMinor : null, bps: cost.kind === "cost" ? cost.bps : null },
          options: comparable.length,
          spread,
          spreadInSource: spread !== null && result.reference?.rate ? round(spread / result.reference.rate) : null,
          reference: result.reference,
        };
      } catch {
        return { status: "no_price", reason: "Couldn’t price this payout right now. Try again shortly." };
      }
    })();
    memo.set(key, work);
    return work;
  };

  // A few at a time: each check calls several providers.
  const quotes: PayrollQuote[] = new Array(body.payouts.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, body.payouts.length) }, async () => {
    while (next < body.payouts.length) {
      const index = next++;
      const payout = body.payouts[index]!;
      quotes[index] = { id: payout.id, ...(await price(payout)) };
    }
  }));
  return NextResponse.json({ quotes, generatedAt: new Date(now).toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
