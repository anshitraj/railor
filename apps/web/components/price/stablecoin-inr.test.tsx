import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { depositSupport, exchangeBySlug, exchangeCharges, type ExchangeQuote, type LiveBid } from "../../lib/india-exchanges";
import { ExchangeCard } from "./stablecoin-inr";

const live = (over: Partial<LiveBid> = {}): LiveBid => ({
  bid: 102.85, ask: 103.39, observedAt: "2026-11-18T13:58:05.000Z", clock: "exchange", depth: "book", gapPct: 10.07, referenceRate: 93.44,
  source: { label: "WazirX public order book", url: "https://docs.wazirx.com/" }, ...over,
});
function priced(slug: string, bid: number, amount: number, over: Partial<LiveBid> = {}): ExchangeQuote {
  const exchange = exchangeBySlug(slug)!;
  const gross = Math.round(amount * bid * 100) / 100;
  return {
    slug: slug as ExchangeQuote["slug"], name: exchange.name, support: depositSupport(exchange, "USDT", "tron"), status: "priced", checkedAt: "2026-11-18T13:58:10.000Z",
    fill: { filled: amount, gross, averagePrice: bid, bestBid: bid, short: false }, breakdown: exchangeCharges(exchange, gross), live: live({ bid, ...over }),
  };
}
const html = (quote: ExchangeQuote | Pick<ExchangeQuote, "slug" | "name" | "support" | "status">, locked = false) =>
  renderToStaticMarkup(<ExchangeCard quote={quote} asset="USDT" network="tron" amount={1000} cost={null} locked={locked} loading={false} best={false} signInHref="/login?intent=start" />);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("an exchange card in the stablecoin page", () => {
  it("shows the live bid, when it was observed, the gap to Wise's mid-market and that it is a market reference", () => {
    const shown = text(html(priced("wazirx", 102.85, 1000)));
    expect(shown).toContain("In your bank ₹1,01,330.90");
    expect(shown).toContain("Best bid ₹102.85 per USDT");
    expect(shown).toMatch(/as of \d\d:\d\d:\d\d/);
    expect(shown).toContain("Against Wise mid-market +10.07% of ₹93.44 per USD");
    expect(shown).toContain("Market reference, not a quote.");
    expect(shown).toContain("Order book read live · fees checked");
  });

  it("says when the time is Railor's read time, because the exchange sends none", () => {
    const markup = html(priced("giottus", 101.91, 1000, { clock: "railor" }));
    expect(text(markup)).toMatch(/read at \d\d:\d\d:\d\d/);
    expect(markup).toContain("this exchange sends no time");
  });

  it("warns when only the best bid is published, so the amount was not walked", () => {
    const shown = text(html(priced("flitpay", 102.33, 1000, { depth: "top" })));
    expect(shown).toContain("Flitpay publishes only its best bid, not its order book");
    expect(shown).toContain("Best bid read live");
  });

  it("drops the GST row where the published fee includes it (Flitpay)", () => {
    const shown = text(html(priced("flitpay", 102.33, 1000, { depth: "top" })));
    expect(shown).toContain("Trading fee (0.50%, GST included)");
    expect(shown).not.toContain("GST on the fee");
    expect(text(html(priced("wazirx", 102.85, 1000)))).toContain("GST on the fee (18%)");
  });

  it("leaves out the gap when Wise's rate didn't load", () => {
    expect(text(html(priced("wazirx", 102.85, 1000, { gapPct: null, referenceRate: null })))).not.toContain("Against Wise");
  });

  it("explains an exchange with no live price instead of leaving a gap, for visitors too", () => {
    for (const locked of [false, true]) {
      // SunCrypto now shows its latest trade; Mudrex is the exchange left with no usable public sell price.
      const exchange = exchangeBySlug("mudrex")!;
      const shown = text(html({ slug: "mudrex", name: "Mudrex", support: depositSupport(exchange, "USDT", "tron"), status: "unavailable", checkedAt: "x", reason: "No live price." } as ExchangeQuote, locked));
      expect(shown, `locked ${locked}`).toContain("Mudrex’s public calculator reads a USDT buy rate");
      expect(shown).not.toContain("Sign in to see");
    }
  });

  it("locks the price for a visitor and shows no number", () => {
    const exchange = exchangeBySlug("wazirx")!;
    const markup = html({ slug: "wazirx", name: "WazirX", support: depositSupport(exchange, "USDT", "tron"), status: "priced" }, true);
    expect(text(markup)).toContain("Sign in to see the full price");
    expect(text(markup)).not.toMatch(/102|103|93\.44/);
  });

  it("shows why an exchange has no price right now", () => {
    const exchange = exchangeBySlug("zebpay")!;
    const shown = text(html({ slug: "zebpay", name: "ZebPay", support: depositSupport(exchange, "USDT", "tron"), status: "unavailable", checkedAt: "x", reason: "Live price unavailable. ZebPay refuses requests from Railor’s server (HTTP 403)." } as ExchangeQuote));
    expect(shown).toContain("ZebPay refuses requests from Railor’s server (HTTP 403)");
    expect(shown).not.toContain("read live");
  });

  it("shows a market reference before fees without presenting it as money in the bank", () => {
    const exchange = exchangeBySlug("koinbx")!;
    const shown = text(html({
      slug: "koinbx", name: exchange.name, support: depositSupport(exchange, "USDT", "tron"),
      status: "market_reference", checkedAt: "2026-11-19T00:00:00.000Z",
      fill: { gross: 101_519, filled: 1000, averagePrice: 101.519, bestBid: 101.519, short: false },
      live: live({ bid: 101.519, ask: 101.521 }),
    }));
    expect(shown).toContain("Gross sale estimate ₹1,01,519.00");
    expect(shown).toContain("0.47% for USDT");
    expect(shown).not.toContain("In your bank");
  });
});
