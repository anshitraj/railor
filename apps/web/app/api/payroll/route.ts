import { NextResponse } from "next/server";
import { z } from "zod";
import { fxTicker, wisePublicTargetQuote, type WiseTargetQuote } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { runPriceCheck } from "../../../lib/pricing";
import { priceView } from "../../../lib/price-view";
import { benchmarkCost } from "../../../lib/price-cost";
import { pricingSourceLabel } from "../../../lib/price-display";
import { consumeLimit } from "../../../lib/rate-limit";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";
import { midMarketSend, netPayGap, PAYROLL_MAX_ROWS, payrollFigure, sendToLand, type PayrollQuote } from "../../../lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each payout calls several providers; a sheet of 50 needs longer than the default.
export const maxDuration = 60;

const Body = z.object({
  sourceCurrency: z.string().regex(/^[A-Z]{3}$/),
  /** send: amounts are what the company sends, in sourceCurrency. receive: each payout's net pay, in its own currency. */
  amountSide: z.enum(["send", "receive"]).default("send"),
  payouts: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]{1,12}$/i),
    // Net pay in IDR or VND runs to many millions; the send amount it implies is checked separately.
    amount: z.number().positive().max(1_000_000_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  })).min(1).max(PAYROLL_MAX_ROWS),
}).refine((body) => body.amountSide === "receive" || body.payouts.every((payout) => payout.amount <= 10_000_000));

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
const round = (value: number) => Math.round(value * 100) / 100;

type Payout = z.infer<typeof Body>["payouts"][number];

/**
 * Prices each payroll payout. Only an opaque id, the amount, the currency and
 * the country arrive here; names and employee IDs stay in the browser.
 *
 * Net pay (amountSide "receive"): Railor's price check prices by the amount
 * sent, so the send amount is estimated from the mid-market rate, priced, and
 * what arrives is compared with the net pay. Wise's public quote can price by
 * the amount received, so when Wise is the best option its own figure for the
 * exact net pay is used for "send this to land it"; any other is scaled from
 * that option's price and labelled an estimate.
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
  const context = { profile: "business" as const, country: org.entityCountry ?? "US", direction: "send" as const, purpose: "salary" as const };

  /** Prices one send amount: the best complete price, or the top estimate. */
  const priceSend = async (payout: Payout, sendAmount: number) => {
    const result = await runPriceCheck(org.id, {
      sourceCurrency: body.sourceCurrency, destinationCurrency: payout.currency, destinationCountry: payout.country ?? undefined, amount: sendAmount, includeMarket: false, context,
    });
    const view = priceView(result, now);
    const figure = payrollFigure(view);
    if (!figure) {
      const hidden = view.excluded.find((row) => row.recipientAmount !== null);
      return { quote: { status: "no_price", reason: hidden ? `No price you can use. ${hidden.profileAssessment?.reasons[0] ?? ""}`.trim() : result.unavailable[0]?.reason ?? "No price for this payout yet.", reference: result.reference } satisfies Omit<PayrollQuote, "id">, figure: null };
    }
    const { row, status } = figure;
    const best = { provider: row.providerName, product: row.product?.label ?? null, recipientAmount: row.recipientAmount, dataStatus: pricingSourceLabel(row), costMinor: null as number | null, bps: null as number | null, feeIncluded: row.costComplete !== false };
    if (status === "estimate") {
      // No comparable price: the top figure as an estimate, with what's unconfirmed — never ranked as the best price.
      // Where its fee is included the cost against mid-market is still real arithmetic, so it is shown (as an estimate).
      const cost = best.feeIncluded ? benchmarkCost(row, sendAmount, result.reference?.rate, payout.currency) : null;
      if (cost?.kind === "cost") { best.costMinor = cost.costMinor; best.bps = cost.bps; }
      return {
        quote: {
          status: "estimate",
          reason: row.costComplete === false ? `Conversion rate only: the transfer fee isn’t included. ${row.missing?.[0] ?? ""}`.trim() : row.missing?.[0] ?? row.profileAssessment?.reasons[0] ?? "A cost or your eligibility is unconfirmed.",
          best, options: view.quotes.length, spread: null, spreadInSource: null, reference: result.reference,
        } satisfies Omit<PayrollQuote, "id">,
        figure: row,
      };
    }
    const comparable = view.quotes.filter((quote) => quote.recipientAmount !== null && !quote.partial && quote.costComplete !== false);
    const least = comparable.reduce((low, quote) => (quote.recipientAmount! < low.recipientAmount! ? quote : low), row);
    const spread = comparable.length > 1 ? round(row.recipientAmount - least.recipientAmount!) : null;
    const cost = benchmarkCost(row, sendAmount, result.reference?.rate, payout.currency);
    if (cost.kind === "cost") { best.costMinor = cost.costMinor; best.bps = cost.bps; }
    return {
      quote: { status: "priced", best, options: comparable.length, spread, spreadInSource: spread !== null && result.reference?.rate ? round(spread / result.reference.rate) : null, reference: result.reference } satisfies Omit<PayrollQuote, "id">,
      figure: row,
    };
  };

  /** Mid-market rate for a pair, shared by every payout in that currency. */
  const rates = new Map<string, Promise<{ rate: number; source: string } | null>>();
  const midRate = (currency: string) => {
    let rate = rates.get(currency);
    if (!rate) {
      rate = fxTicker([[body.sourceCurrency, currency]]).then(([tick]) => (tick ? { rate: tick.rate, source: "Wise’s public mid-market rate" } : null)).catch(() => null);
      rates.set(currency, rate);
    }
    return rate;
  };

  const priceNetPay = async (payout: Payout): Promise<Omit<PayrollQuote, "id">> => {
    const target = payout.amount;
    // Wise prices by the amount received; its quote also carries the mid-market rate.
    const exact: WiseTargetQuote | null = await wisePublicTargetQuote({ sourceAsset: body.sourceCurrency, destinationCurrency: payout.currency, targetAmount: target }).catch(() => null);
    const mid = exact ? { rate: exact.rate, source: "Wise’s public mid-market rate" } : await midRate(payout.currency);
    if (!mid) return { status: "no_price", reason: `No mid-market rate for ${body.sourceCurrency} to ${payout.currency} right now, so the send amount can’t be estimated.` };
    const sent = midMarketSend(target, mid.rate);
    if (sent === null || sent < 1) return { status: "no_price", reason: "This net pay is too small to price." };
    if (sent > 10_000_000) return { status: "no_price", reason: `This net pay is more than 10,000,000 ${body.sourceCurrency} to send. Split it into smaller payouts.` };
    const { quote, figure } = await priceSend(payout, sent);
    const feeIncluded = figure ? figure.costComplete !== false : false;
    const gap = figure && feeIncluded ? netPayGap(figure.recipientAmount!, target) : null;
    const wiseIsBest = figure?.providerSlug === "wise" && figure.basis === "live_public";
    const land = !figure || !feeIncluded ? null
      : wiseIsBest && exact ? { amount: exact.sourceAmount, basis: "provider_quote" as const, provider: "Wise" }
        : (() => { const amount = sendToLand(sent, figure.recipientAmount!, target); return amount === null ? null : { amount, basis: "estimate" as const, provider: figure.providerName.split(" · ")[0]! }; })();
    return { ...quote, netPay: { target, sent, midRate: mid.rate, rateSource: mid.source, gap, land } };
  };

  const memo = new Map<string, Promise<Omit<PayrollQuote, "id">>>();
  const price = (payout: Payout): Promise<Omit<PayrollQuote, "id">> => {
    if (payout.currency === body.sourceCurrency) {
      return Promise.resolve({ status: "same_currency", reason: "Same currency as you pay from, so there’s no conversion to compare.", ...(body.amountSide === "receive" ? { netPay: { target: payout.amount, sent: payout.amount, midRate: 1, rateSource: "Same currency", gap: null, land: null } } : {}) });
    }
    const key = `${payout.currency}:${payout.country ?? ""}:${payout.amount}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const work = (async (): Promise<Omit<PayrollQuote, "id">> => {
      try {
        return body.amountSide === "receive" ? await priceNetPay(payout) : (await priceSend(payout, payout.amount)).quote;
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
  return NextResponse.json({ quotes, amountSide: body.amountSide, generatedAt: new Date(now).toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
