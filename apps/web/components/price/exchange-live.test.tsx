import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExchangeBid } from "@railor/core";
import { exchangeBySlug, estimateSale } from "../../lib/indian-exchanges";
import type { LiveView } from "../../lib/exchange-live";
import { ExchangeLive } from "./exchange-live";

const bid = (over: Partial<ExchangeBid> = {}): ExchangeBid => ({
  status: "ok", slug: "wazirx", bid: 102.85, ask: 103.43, observedAt: "2026-11-18T13:58:05.000Z", clock: "exchange", gapPct: 10.07,
  source: { label: "WazirX public ticker", url: "https://docs.wazirx.com/" }, ...over,
});
const priced = (slug: string, over: Partial<ExchangeBid> = {}): Extract<LiveView, { kind: "ok" }> => {
  const exchange = exchangeBySlug(slug)!;
  const rate = bid({ slug: slug as ExchangeBid["slug"], ...over });
  return { kind: "ok", bid: rate, reference: { rate: 93.44, source: "Wise's public rate (mid-market)", observedAt: "2026-11-18T13:58:00.000Z" }, estimate: estimateSale(exchange, 1000, rate.bid), fee: { pct: exchange.entryFeePct, gstIncluded: exchange.gstIncluded } };
};
const html = (view: LiveView, amount = 1000) => renderToStaticMarkup(<ExchangeLive view={view} amount={amount} signInHref="/login?intent=start&amp;next=%2Fprices" />);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("an exchange card's live slot", () => {
  it("shows the estimate, the bid with its time, the gap to Wise's mid-market rate and what it is", () => {
    const shown = text(html(priced("wazirx")));
    expect(shown).toContain("For 1,000 USDT you’d get about ₹1,01,341");
    expect(shown).toContain("Best bid ₹102.85 per USDT");
    expect(shown).toMatch(/as of \d\d:\d\d:\d\d/);
    expect(shown).toContain("Against Wise mid-market +10.07% of ₹93.44 per USD");
    expect(shown).toContain("Market reference, not a quote.");
  });

  it("lays out the working: sale value, fee, GST, TDS, what is left", () => {
    const shown = text(html(priced("wazirx")));
    expect(shown).toContain("1,000 USDT × ₹102.85 ₹1,02,850.00");
    expect(shown).toContain("Trading fee 0.4% −₹411.40");
    expect(shown).toContain("GST 18% on the fee −₹74.05");
    expect(shown).toContain("TDS 1% of the sale after fees −₹1,023.65");
    expect(shown).toContain("Left in your exchange account ₹1,01,340.90");
  });

  it("drops the GST row where the published fee includes it", () => {
    const shown = text(html(priced("flitpay", { slug: "flitpay", bid: 102.33 })));
    expect(shown).toContain("Trading fee 0.5%, GST included −₹511.65");
    expect(shown).not.toContain("GST 18% on the fee");
  });

  it("says when the time is Railor's own read time, because the exchange sends none", () => {
    const markup = html(priced("giottus", { slug: "giottus", clock: "railor" }));
    expect(text(markup)).toMatch(/read at \d\d:\d\d:\d\d/);
    expect(markup).toContain("this exchange sends no time");
  });

  it("still shows the bid when no amount is entered, and no gap when Wise's rate did not load", () => {
    const view = { ...priced("wazirx", { gapPct: null }), estimate: null, reference: null };
    const shown = text(html(view, 0));
    expect(shown).toContain("Best bid ₹102.85 per USDT");
    expect(shown).not.toContain("you’d get about");
    expect(shown).not.toContain("Against Wise");
  });

  it("locks the price for a visitor with a fixed stand-in and a sign-in link, and shows no real number", () => {
    const markup = html({ kind: "locked" });
    expect(markup).toContain('href="/login?intent=start&amp;next=%2Fprices"');
    expect(text(markup)).toContain("Sign in to see the live price");
    expect(text(markup)).not.toMatch(/102|103|101|93\.44/);
    expect(markup).toContain("aria-hidden");
  });

  it("explains a missing price instead of leaving a gap", () => {
    expect(text(html({ kind: "loading" }))).toBe("Reading the live price…");
    expect(text(html({ kind: "failed" }))).toContain("Live prices didn’t load.");
    expect(text(html({ kind: "unavailable", detail: "Giottus asked Railor to slow down (HTTP 429)." }))).toBe("Live price unavailable. Giottus asked Railor to slow down (HTTP 429).");
    expect(text(html({ kind: "no-feed", reason: "Mudrex’s public price API covers its futures markets only" }))).toBe("No live price. Mudrex’s public price API covers its futures markets only.");
  });
});
