import type { Network, RouteCard } from "./stablecoin-routes";

/**
 * Indian exchanges where USDT is sold for INR and withdrawn to a bank account,
 * each read from the exchange's own fee, help and market pages on 2026-11-18
 * (no blog roundup, aggregator or AI answer supplied a number).
 *
 * Fees are the entry tier on the INR market. The rate itself is the exchange's
 * live order book, which Railor never converts or guesses. Every sale of a
 * virtual digital asset has 1% TDS withheld (Income-tax Act s.194S); each
 * exchange states it on its own pages.
 */
export interface ExchangeRail {
  slug: string;
  name: string;
  /** Entry-tier trading fee, percent of the sale. */
  entryFeePct: number;
  /** Whether the published fee already includes the 18% GST. */
  gstIncluded: boolean;
  /** The fee ladder as published. */
  feeDetail: string;
  /** What it costs and takes to get INR from the exchange to a bank account. */
  inrOut: string;
  /** Networks the exchange lists for USDT deposits that Railor offers, plus how to say them. Null: the exchange does not list them. */
  networks: { listed: Network[]; label: string } | null;
  /** The exchange's own fee page: the card's source. */
  feeUrl: string;
  /** Where to start the sale: the exchange's USDT/INR market or sell page. */
  marketUrl: string;
}

export const EXCHANGE_CHECKED = "2026-11-18";

export const EXCHANGES: ExchangeRail[] = [
  {
    slug: "wazirx", name: "WazirX", entryFeePct: 0.4, gstIncluded: false,
    feeDetail: "0.40% at the entry tier, down to 0.10% with volume and WRX, plus GST. Or ₹99 a month for zero trading fees (WazirX ZERO)",
    inrOut: "₹10 a withdrawal (WazirX shows INR fees as waived right now), from ₹500 up to ₹2,00,000 each; instant or NEFT",
    networks: { listed: ["ethereum", "tron"], label: "Ethereum (ERC-20) and Tron (TRC-20)" },
    feeUrl: "https://wazirx.com/fees", marketUrl: "https://wazirx.com/exchange/USDT-INR",
  },
  {
    slug: "suncrypto", name: "SunCrypto", entryFeePct: 0.4, gstIncluded: false,
    feeDetail: "0.40% on INR pairs, plus 18% GST. Its 0.25% USDT-pair fee is crypto to crypto and never reaches rupees",
    inrOut: "₹10 a withdrawal, charged by its banking partner; instant",
    networks: null,
    feeUrl: "https://suncrypto.in/fee-structure", marketUrl: "https://suncrypto.in/",
  },
  {
    slug: "giottus", name: "Giottus", entryFeePct: 0.4, gstIncluded: false,
    feeDetail: "0.4% under ₹5 lakh of 30-day volume, down to 0.05%, plus 18% GST",
    inrOut: "no fee, from ₹500 up to ₹50,00,000; reaches your bank within 24 hours on working days",
    networks: { listed: ["ethereum", "tron"], label: "Ethereum, Tron and BNB Smart Chain, from 0.2 USDT" },
    feeUrl: "https://www.giottus.com/docs/fees.html", marketUrl: "https://www.giottus.com/",
  },
  {
    slug: "flitpay", name: "Flitpay", entryFeePct: 0.5, gstIncluded: true,
    feeDetail: "0.50% under ₹1 lakh of 30-day volume, down to 0.05%, GST included",
    inrOut: "₹20 instant up to ₹50,000, or ₹10 standard up to ₹5,00,000 within 3 working days; from ₹100",
    networks: { listed: ["ethereum", "tron"], label: "Tron, BNB Smart Chain and Ethereum" },
    feeUrl: "https://www.flitpay.com/fees/trading-fees", marketUrl: "https://www.flitpay.com/",
  },
  {
    slug: "zebpay", name: "ZebPay", entryFeePct: 0.45, gstIncluded: false,
    feeDetail: "0.45% at the entry tier, plus 18% GST. Quick Trade is 0.5% onwards",
    inrOut: "₹15 flat, from ₹100 up to ₹70,00,000; up to 3 working days. USDT/INR orders run from ₹93 to ₹5,00,000",
    networks: { listed: ["ethereum", "tron"], label: "Ethereum (ERC-20) and Tron (TRC-20)" },
    feeUrl: "https://zebpay.com/in/features/pricing", marketUrl: "https://zebpay.com/",
  },
  {
    slug: "coindcx", name: "CoinDCX", entryFeePct: 0.5, gstIncluded: false,
    feeDetail: "0.50% under ₹2 lakh of 30-day volume, down to 0.03%, plus 18% GST. The level updates weekly",
    inrOut: "no fee, from ₹100",
    networks: null,
    feeUrl: "https://coindcx.com/fees", marketUrl: "https://coindcx.com/convert/usdt/inr/tether-to-indian-rupee-price",
  },
  {
    slug: "mudrex", name: "Mudrex", entryFeePct: 1, gstIncluded: false,
    feeDetail: "1% on USDT sales, plus 18% GST. Its fee page lists this; some Mudrex blog posts say USDT sales are free, so the fee page is the source",
    inrOut: "no fee; instant",
    networks: { listed: ["ethereum", "tron"], label: "Tron and Ethereum (its guide also names BNB Smart Chain)" },
    feeUrl: "https://mudrex.com/fee", marketUrl: "https://mudrex.com/off-ramp/usdt",
  },
];

/** What the entry-tier fee costs once GST is on it. */
export function allInPct(exchange: ExchangeRail) {
  return exchange.entryFeePct * (exchange.gstIncluded ? 1 : 1.18);
}

function percent(value: number) {
  return `${value.toFixed(2)}%`;
}

/** USDT-to-INR exchange cards for the network the USDT sits on, cheapest all-in entry fee first. */
export function exchangeCards(network: Network, networkLabel: string): RouteCard[] {
  return EXCHANGES
    .filter((exchange) => !exchange.networks || exchange.networks.listed.includes(network))
    .sort((a, b) => allInPct(a) - allInPct(b))
    .map((exchange): RouteCard => ({
      id: `exchange-${exchange.slug}`,
      provider: exchange.name,
      slug: exchange.slug,
      title: "Sell USDT for INR, withdraw to your bank",
      delivers: "INR in your bank account",
      points: [
        `Fee: ${exchange.feeDetail}.`,
        `INR to your bank: ${exchange.inrOut}.`,
        exchange.networks ? `Takes USDT on ${exchange.networks.label}.` : `${exchange.name} doesn’t publish the networks it takes for USDT; its deposit screen shows them.`,
      ],
      price: `${percent(exchange.entryFeePct)} ${exchange.gstIncluded ? "incl. GST" : "+ GST"}`,
      priceNote: "Entry-tier trading fee. The rate is the exchange’s live USDT/INR order book, and 1% TDS is withheld on the sale.",
      ...(exchange.networks ? {} : { caution: `Confirm ${networkLabel} is offered for USDT on its deposit screen before you send.` }),
      action: { label: `Open ${exchange.name}`, url: exchange.marketUrl },
      sourceUrl: exchange.feeUrl,
      checkedAt: EXCHANGE_CHECKED,
    }));
}
