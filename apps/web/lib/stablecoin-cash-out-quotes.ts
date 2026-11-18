import "server-only";
import { fillBids } from "./india-exchanges";
import { CASH_OUT_RAILS, KRAKEN_TAKER_RATE, KRAKEN_TRADE_MINIMUM, cashOutRestriction, type CashOutResponse } from "./stablecoin-cash-out";
import type { CashOutCurrency, Network, Stablecoin } from "./stablecoin-routes";

type Result = Extract<CashOutResponse, { locked: false }>;
const unavailable = (reason: string): Result => ({ locked: false, quote: null, reason });
const cents = (value: number) => Math.round(value * 100) / 100;

export async function stablecoinCashOutQuote(asset: Stablecoin, network: Network, destination: CashOutCurrency, amount: number): Promise<Result> {
  const restriction = cashOutRestriction(asset, network, destination);
  if (restriction) return unavailable(restriction);
  if (amount < KRAKEN_TRADE_MINIMUM) return unavailable("Kraken Pro requires at least " + KRAKEN_TRADE_MINIMUM + " " + asset + " per order.");

  const url = "https://api.kraken.com/0/public/Depth?pair=" + asset + destination + "&count=100";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), next: { revalidate: 15 } });
    if (!response.ok) return unavailable("Kraken’s order book is temporarily unavailable.");
    const payload = await response.json() as { error?: unknown[]; result?: Record<string, { bids?: unknown }> };
    const book = Object.values(payload.result ?? {})[0];
    if (payload.error?.length || !Array.isArray(book?.bids)) return unavailable("Kraken’s order book is temporarily unavailable.");
    const fill = fillBids(book.bids.flatMap((bid: unknown): Array<[number, number]> =>
      Array.isArray(bid) ? [[Number(bid[0]), Number(bid[1])]] : []
    ), amount);
    if (!fill || fill.short) return unavailable("Kraken’s visible bids can’t fill this amount right now.");

    const rail = CASH_OUT_RAILS[destination];
    const tradingFee = cents(fill.gross * KRAKEN_TAKER_RATE);
    const withdrawalAmount = cents(fill.gross - tradingFee);
    const withdrawalFee = cents(rail.flatFee + withdrawalAmount * (rail.feeRate ?? 0));
    const payout = cents(withdrawalAmount - withdrawalFee);
    // Kraken's withdrawal minimum includes its fee.
    if (withdrawalAmount < rail.minimum || payout <= 0) return unavailable("The sale falls below the " + rail.minimum + " " + destination + " withdrawal minimum.");
    return { locked: false, quote: {
      gross: fill.gross, tradingFee, withdrawalFee, payout, averagePrice: fill.averagePrice,
      observedAt: response.headers.get("date") ?? new Date().toISOString(),
    } };
  } catch {
    return unavailable("Kraken’s order book is temporarily unavailable.");
  }
}
