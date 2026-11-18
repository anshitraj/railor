import type { ExchangeBid, ExchangeRate, UsdtInrExchangeRates } from "@railor/core";
import { estimateSale, exchangeBySlug, type SaleEstimate } from "./indian-exchanges";
import type { RouteCard } from "./stablecoin-routes";

/** What the live-price poll has so far. */
export type RatesState =
  | { status: "idle"; data: null }
  | { status: "loading"; data: null }
  | { status: "error"; data: null }
  | { status: "ready"; data: UsdtInrExchangeRates };

/** What an exchange card shows in its live-price slot. */
export type LiveView =
  | { kind: "locked" }
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "no-feed"; reason: string }
  | { kind: "unavailable"; detail: string }
  | {
      kind: "ok";
      bid: ExchangeBid;
      reference: UsdtInrExchangeRates["reference"];
      /** From the entered amount and the exchange's published entry fee; null when the amount is empty. */
      estimate: SaleEstimate | null;
      fee: { pct: number; gstIncluded: boolean };
    };

export const isExchangeCard = (route: Pick<RouteCard, "id">) => route.id.startsWith("exchange-");

/**
 * The live-price slot for a route card; null for cards that aren't Indian
 * exchanges, and for an exchange with no usable public feed when nobody is
 * signed in (nothing to unlock). Visitors get a locked slot and no number:
 * the numbers never reach the browser until the account is signed in.
 */
export function liveView(route: Pick<RouteCard, "id" | "slug">, input: { signedIn: boolean; state: RatesState; amount: number }): LiveView | null {
  if (!isExchangeCard(route)) return null;
  const exchange = exchangeBySlug(route.slug);
  if (!exchange) return null;
  if (exchange.noLivePrice) return input.signedIn ? { kind: "no-feed", reason: exchange.noLivePrice } : null;
  if (!input.signedIn) return { kind: "locked" };
  const { state } = input;
  if (state.status === "idle" || state.status === "loading") return { kind: "loading" };
  if (state.status === "error") return { kind: "failed" };
  const rate = (state.data.rates as Record<string, ExchangeRate | undefined>)[route.slug];
  if (!rate) return { kind: "unavailable", detail: `${exchange.name} has no public price feed Railor can read.` };
  if (rate.status === "unavailable") return { kind: "unavailable", detail: rate.detail };
  return {
    kind: "ok",
    bid: rate,
    reference: state.data.reference,
    estimate: estimateSale(exchange, input.amount, rate.bid),
    fee: { pct: exchange.entryFeePct, gstIncluded: exchange.gstIncluded },
  };
}

/**
 * Exchange cards with a live price go by what the sale would leave, best
 * first, because the bids differ by more than the fees do. Cards without one
 * keep their fee order after them, and every other route stays where it was.
 */
export function rankExchangeCards<T extends Pick<RouteCard, "id">>(routes: T[], views: ReadonlyMap<string, LiveView | null>): T[] {
  const left = (route: T) => {
    const view = views.get(route.id);
    return view?.kind === "ok" && view.estimate ? view.estimate.net : -1;
  };
  const sorted = routes.filter(isExchangeCard).sort((a, b) => left(b) - left(a));
  let next = 0;
  return routes.map((route) => (isExchangeCard(route) ? sorted[next++]! : route));
}

/** Rupees in the lakh grouping the exchange cards already use ("₹2,00,000"). */
export function rupees(value: number, places = 0) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
}

export function signedPercent(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
}

/** HH:MM:SS in the viewer's time zone, or "" for a time that doesn't parse. */
export function clockTime(iso: string, timeZone?: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", ...(timeZone ? { timeZone } : {}) });
}
