import "server-only";
import { inrExchangeRates, type ExchangeRateDeps, type InrExchangeRates } from "@railor/core";
import { depositSupport, exchangeCharges, exchangesFor, fillBids, type BookFill, type ExchangeQuote, type LiveBid } from "./india-exchanges";
import type { Network, Stablecoin } from "./stablecoin-routes";

export interface IndiaQuotes {
  /** Best INR in the bank first; exchanges with no price after them. */
  quotes: ExchangeQuote[];
  /** Wise's mid-market USD/INR rate every live bid is measured against. */
  reference: InrExchangeRates["reference"];
}

const paise = (value: number) => Math.round(value * 100) / 100;

/**
 * Live sell quotes for `amount` of `asset` on every Indian exchange that lists
 * it. The market data is read, checked and shared in core; here it is priced
 * with each exchange's own fees. An exchange with no usable price stays in the
 * list with the reason, so nothing quietly disappears.
 */
export async function indiaExchangeQuotes(asset: Stablecoin, network: Network, amount: number, deps: ExchangeRateDeps = {}): Promise<IndiaQuotes> {
  const market = await inrExchangeRates(asset, deps);
  const quotes = exchangesFor(asset).map((exchange): ExchangeQuote => {
    const base = { slug: exchange.slug, name: exchange.name, support: depositSupport(exchange, asset, network), checkedAt: market.generatedAt };
    if (exchange.noLivePrice) return { ...base, status: "unavailable", reason: `No live price. ${exchange.noLivePrice}.` };
    const rate = (market.rates as Record<string, InrExchangeRates["rates"][keyof InrExchangeRates["rates"]]>)[exchange.slug];
    if (!rate) return { ...base, status: "unavailable", reason: `${exchange.name} has no public price feed Railor can read.` };
    if (rate.status === "unavailable") return { ...base, status: "unavailable", reason: `Live price unavailable. ${rate.detail}` };
    // A feed with only a best bid can't be walked: the amount is priced at that bid, and the live block says so.
    const fill: BookFill | null = rate.depth === "book" ? fillBids(rate.bids, amount) : amount > 0 ? { filled: amount, gross: paise(amount * rate.bid), averagePrice: rate.bid, bestBid: rate.bid, short: false } : null;
    if (!fill) return { ...base, status: "unavailable", reason: `${exchange.name}’s ${asset}/INR book is empty right now.` };
    const breakdown = exchangeCharges(exchange, fill.gross);
    const live: LiveBid = { bid: rate.bid, ask: rate.ask, observedAt: rate.observedAt, clock: rate.clock, depth: rate.depth, gapPct: rate.gapPct, referenceRate: market.reference?.rate ?? null, source: rate.source };
    return {
      ...base,
      status: "priced",
      fill,
      breakdown,
      live,
      ...(breakdown.inBank < exchange.withdrawalMin ? { belowMinimum: true } : {}),
      ...(exchange.withdrawalMax && breakdown.inBank > exchange.withdrawalMax ? { aboveMaximum: true } : {}),
    };
  });
  return { quotes: quotes.sort((a, b) => (b.breakdown?.inBank ?? -1) - (a.breakdown?.inBank ?? -1)), reference: market.reference };
}
