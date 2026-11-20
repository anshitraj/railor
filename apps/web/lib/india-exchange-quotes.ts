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
    const rate = exchange.slug in market.rates ? market.rates[exchange.slug as keyof InrExchangeRates["rates"]] : undefined;
    if (!rate) return { ...base, status: "unavailable", reason: `${exchange.name} has no public price feed Railor can read.` };
    if (rate.status === "unavailable") return { ...base, status: "unavailable", reason: `Live price unavailable. ${rate.detail}` };
    if (rate.status === "last_trade") return { ...base, status: "last_trade", trade: rate };
    // A feed with only a best bid can't be walked: the amount is priced at that bid, and the live block says so.
    const fill: BookFill | null = rate.depth === "book" ? fillBids(rate.bids, amount) : amount > 0 ? { filled: amount, gross: paise(amount * rate.bid), averagePrice: rate.bid, bestBid: rate.bid, short: false } : null;
    if (!fill) return { ...base, status: "unavailable", reason: `${exchange.name}’s ${asset}/INR book is empty right now.` };
    const live: LiveBid = { bid: rate.bid, ask: rate.ask, observedAt: rate.observedAt, clock: rate.clock, depth: rate.depth, gapPct: rate.gapPct, referenceRate: market.reference?.rate ?? null, source: rate.source };
    if (exchange.feeRate === null || exchange.withdrawalFee === null) {
      return { ...base, status: "market_reference", fill, live, reason: "Gross sale estimate. INR withdrawal costs and GST treatment require confirmation." };
    }
    const breakdown = exchangeCharges(exchange, fill.gross);
    return {
      ...base,
      status: "priced",
      fill,
      breakdown,
      live,
      ...(exchange.withdrawalMin !== null && breakdown.inBank < exchange.withdrawalMin ? { belowMinimum: true } : {}),
      ...(exchange.withdrawalMax && breakdown.inBank > exchange.withdrawalMax ? { aboveMaximum: true } : {}),
    };
  });
  const group = (quote: ExchangeQuote) => {
    if (quote.status === "priced") return 0;
    if (quote.status === "market_reference") return 1;
    if (quote.status === "last_trade") return 2;
    return 3;
  };
  return { quotes: quotes.sort((a, b) => group(a) - group(b) || (b.breakdown?.inBank ?? 0) - (a.breakdown?.inBank ?? 0)), reference: market.reference };
}
