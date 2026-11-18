/**
 * Selling USDT or USDC for INR on an Indian exchange, priced from the
 * exchange's own public order book and its own published fee schedule
 * (re-read 2026-11-18). The quote walks the live bids for the exact amount,
 * so a large sale shows the price it would really fill at, not the top bid.
 *
 *   CoinDCX — coindcx.com/fees: Spot (INR) fee 0.50% at Regular 1 (< ₹2 lakh
 *             30-day volume), 18% GST on fees; INR withdrawal ₹0, min ₹100.
 *   WazirX  — wazirx.com/blog/revised-fee-structure-december-2025: Pay Per
 *             Trade INR market 0.40% at ₹0–5 lakh volume and < 500 WRX, GST
 *             extra; WazirX ZERO (₹99/month + GST) removes the trading fee.
 *             support.wazirx.com: INR withdrawal ₹10 incl. taxes, ₹500–₹2,00,000.
 *
 * Tax (incometaxindia.gov.in): 1% TDS under Section 194S on the consideration
 * net of the exchange's charges; income from a VDA transfer taxed at 30% plus
 * surcharge and cess under Section 115BBH, with no deduction except the cost
 * of acquisition and no set-off of losses. TDS is a credit against that tax.
 *
 * Railor only reads public prices. It never holds crypto or INR.
 */
import type { Network, Stablecoin } from "./stablecoin-routes";

export type ExchangeSlug = "coindcx" | "wazirx";
export type DepositSupport = "yes" | "no" | "unknown";

export const EXCHANGES_CHECKED = "2026-11-18";
export const GST_RATE = 0.18;
export const TDS_RATE = 0.01;
/** 30% under Section 115BBH plus 4% health and education cess. Surcharge (income above ₹50 lakh) is extra. */
export const VDA_TAX_RATE = 0.312;

export interface IndiaExchange {
  slug: ExchangeSlug;
  name: string;
  site: string;
  tradeUrl: (asset: Stablecoin) => string;
  feeRate: number;
  feeLabel: string;
  feeNote: string;
  feeSource: string;
  withdrawalFee: number;
  withdrawalMin: number;
  withdrawalMax?: number;
  withdrawalNote?: string;
  withdrawalSource: string;
  networks: Record<Stablecoin, { listed: Network[]; unknown?: Network[] | "all"; source: string; noNote: string; unknownNote: string }>;
  bookUrl: (asset: Stablecoin) => string;
  parseBook: (body: unknown) => Array<[number, number]>;
}

const COINDCX_CHAINS: Network[] = ["ethereum", "base", "arbitrum", "polygon", "bnb", "solana"];
const COINDCX_NETWORKS_SOURCE = "https://support.coindcx.com/articles/transfer/which-blockchain-networks-are-supported-for-transfers-between-coindcx-and-coindcx-web3/66d82d2b2b52180f6c097752";

export const INDIA_EXCHANGES: IndiaExchange[] = [
  {
    slug: "coindcx",
    name: "CoinDCX",
    site: "https://coindcx.com",
    tradeUrl: (asset) => `https://coindcx.com/trade/${asset}INR`,
    feeRate: 0.005,
    feeLabel: "0.50% trading fee",
    feeNote: "Regular 1 tier (under ₹2 lakh traded in 30 days). Drops to 0.42% from ₹2 lakh and 0.17% from ₹5 lakh.",
    feeSource: "https://coindcx.com/fees",
    withdrawalFee: 0,
    withdrawalMin: 100,
    withdrawalSource: "https://coindcx.com/fees",
    networks: {
      USDT: { listed: COINDCX_CHAINS, unknown: ["tron"], source: COINDCX_NETWORKS_SOURCE, noNote: "Not in CoinDCX’s published network list", unknownNote: "CoinDCX doesn’t name Tron in its list. Check its deposit page first." },
      USDC: { listed: COINDCX_CHAINS, source: COINDCX_NETWORKS_SOURCE, noNote: "Not in CoinDCX’s published network list", unknownNote: "Check CoinDCX’s deposit page first." },
    },
    bookUrl: (asset) => `https://public.coindcx.com/market_data/orderbook?pair=I-${asset}_INR`,
    parseBook: (body) => {
      const bids = (body as { bids?: Record<string, string> })?.bids;
      return bids && typeof bids === "object" ? Object.entries(bids).map(([price, qty]) => [Number(price), Number(qty)]) : [];
    },
  },
  {
    slug: "wazirx",
    name: "WazirX",
    site: "https://wazirx.com",
    tradeUrl: (asset) => `https://wazirx.com/exchange/${asset}-INR`,
    feeRate: 0.004,
    feeLabel: "0.40% trading fee",
    feeNote: "Pay Per Trade, under ₹5 lakh traded in 30 days. WazirX ZERO (₹99 a month + GST) charges no trading fee instead.",
    feeSource: "https://wazirx.com/blog/revised-fee-structure-december-2025/",
    withdrawalFee: 10,
    withdrawalMin: 500,
    withdrawalMax: 200_000,
    withdrawalNote: "₹10 per withdrawal in WazirX’s fee table; a banner on the same page says it’s currently waived.",
    withdrawalSource: "https://support.wazirx.com/hc/en-us/articles/360001690794-How-can-I-withdraw-INR-to-my-bank-account",
    networks: {
      USDT: { listed: ["ethereum", "tron"], source: "https://wazirx.com/blog/month-in-review-april-2024/", noNote: "WazirX takes USDT only on Ethereum (ERC20) and Tron (TRC20)", unknownNote: "" },
      USDC: { listed: [], unknown: "all", source: "https://support.wazirx.com/hc/en-us/articles/360001653334-How-to-Deposit-Receive-Cryptocurrency-to-your-WazirX-account", noNote: "", unknownNote: "WazirX doesn’t publish its USDC networks. Check its deposit page first." },
    },
    bookUrl: (asset) => `https://api.wazirx.com/sapi/v1/depth?symbol=${asset.toLowerCase()}inr&limit=100`,
    parseBook: (body) => {
      const bids = (body as { bids?: Array<[string, string]> })?.bids;
      return Array.isArray(bids) ? bids.map(([price, qty]) => [Number(price), Number(qty)]) : [];
    },
  },
];

export function exchangeBySlug(slug: string) {
  return INDIA_EXCHANGES.find((exchange) => exchange.slug === slug);
}

/** Whether an exchange takes deposits of this token on this network, by its own published list. */
export function depositSupport(exchange: IndiaExchange, asset: Stablecoin, network: Network): { status: DepositSupport; note: string } {
  const rules = exchange.networks[asset];
  if (rules.listed.includes(network)) return { status: "yes", note: `Listed by ${exchange.name}` };
  if (rules.unknown === "all" || rules.unknown?.includes(network)) return { status: "unknown", note: rules.unknownNote };
  return { status: "no", note: rules.noNote };
}

const paise = (value: number) => Math.round(value * 100) / 100;

export interface BookFill {
  filled: number;
  gross: number;
  averagePrice: number;
  bestBid: number;
  /** True when the visible book couldn't absorb the whole amount. */
  short: boolean;
}

/** Sells `amount` into the bids, best price first. */
export function fillBids(bids: Array<[number, number]>, amount: number): BookFill | null {
  const clean = bids.filter(([price, qty]) => Number.isFinite(price) && Number.isFinite(qty) && price > 0 && qty > 0).sort((a, b) => b[0] - a[0]);
  if (!clean.length || !(amount > 0)) return null;
  let left = amount;
  let gross = 0;
  for (const [price, qty] of clean) {
    const take = Math.min(left, qty);
    gross += take * price;
    left -= take;
    if (left <= 1e-9) break;
  }
  const filled = amount - Math.max(0, left);
  return { filled, gross: paise(gross), averagePrice: gross / filled, bestBid: clean[0]![0], short: left > 1e-9 };
}

export interface ExchangeBreakdown {
  gross: number;
  tradingFee: number;
  gst: number;
  tds: number;
  withdrawalFee: number;
  /** What reaches the bank after the exchange's charges and TDS. */
  inBank: number;
}

/** The exchange's charges on a sale, in INR. TDS is 1% of the consideration net of those charges. */
export function exchangeCharges(exchange: Pick<IndiaExchange, "feeRate" | "withdrawalFee">, gross: number): ExchangeBreakdown {
  const tradingFee = paise(gross * exchange.feeRate);
  const gst = paise(tradingFee * GST_RATE);
  const tds = paise((gross - tradingFee - gst) * TDS_RATE);
  const withdrawalFee = exchange.withdrawalFee;
  return { gross, tradingFee, gst, tds, withdrawalFee, inBank: paise(gross - tradingFee - gst - tds - withdrawalFee) };
}

export interface VdaTax {
  gain: number;
  tax: number;
  /** Tax still to pay after the TDS credit; negative means TDS covers more than the tax. */
  balance: number;
  afterTax: number;
  /** True when no cost was given, so the whole sale was treated as gain. */
  worstCase: boolean;
}

/**
 * Income-tax on the sale: 30% + 4% cess on (sale value − cost of acquisition).
 * No other deduction, so the exchange's fees don't lower the gain. The TDS
 * already deducted counts towards this tax.
 */
export function vdaTax(breakdown: ExchangeBreakdown, cost: number | null): VdaTax {
  const worstCase = cost === null || !Number.isFinite(cost) || cost < 0;
  const gain = paise(Math.max(0, breakdown.gross - (worstCase ? 0 : cost!)));
  const tax = paise(gain * VDA_TAX_RATE);
  const balance = paise(tax - breakdown.tds);
  return { gain, tax, balance, afterTax: paise(breakdown.inBank - balance), worstCase };
}

export interface ExchangeQuote {
  slug: ExchangeSlug;
  name: string;
  support: { status: DepositSupport; note: string };
  status: "priced" | "unavailable";
  reason?: string;
  fill?: BookFill;
  breakdown?: ExchangeBreakdown;
  belowMinimum?: boolean;
  aboveMaximum?: boolean;
  checkedAt: string;
}

type BookCache = { at: number; bids: Array<[number, number]> };
const cache = new Map<string, BookCache>();
const BOOK_TTL_MS = 10_000;

async function loadBids(exchange: IndiaExchange, asset: Stablecoin, fetcher: typeof fetch): Promise<Array<[number, number]>> {
  const key = `${exchange.slug}:${asset}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < BOOK_TTL_MS) return hit.bids;
  const response = await fetcher(exchange.bookUrl(asset), { signal: AbortSignal.timeout(6_000), headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${exchange.name} returned ${response.status}`);
  const bids = exchange.parseBook(await response.json());
  cache.set(key, { at: Date.now(), bids });
  return bids;
}

/** Live sell quotes for `amount` of `asset`, best INR in the bank first. */
export async function indiaExchangeQuotes(asset: Stablecoin, network: Network, amount: number, fetcher: typeof fetch = fetch): Promise<ExchangeQuote[]> {
  const quotes = await Promise.all(INDIA_EXCHANGES.map(async (exchange): Promise<ExchangeQuote> => {
    const base = { slug: exchange.slug, name: exchange.name, support: depositSupport(exchange, asset, network), checkedAt: new Date().toISOString() };
    try {
      const fill = fillBids(await loadBids(exchange, asset, fetcher), amount);
      if (!fill) return { ...base, status: "unavailable", reason: `${exchange.name}’s ${asset}/INR book is empty right now.` };
      const breakdown = exchangeCharges(exchange, fill.gross);
      return {
        ...base,
        status: "priced",
        fill,
        breakdown,
        ...(breakdown.inBank < exchange.withdrawalMin ? { belowMinimum: true } : {}),
        ...(exchange.withdrawalMax && breakdown.inBank > exchange.withdrawalMax ? { aboveMaximum: true } : {}),
      };
    } catch {
      return { ...base, status: "unavailable", reason: `${exchange.name}’s price didn’t load. Try again in a moment.` };
    }
  }));
  return quotes.sort((a, b) => (b.breakdown?.inBank ?? -1) - (a.breakdown?.inBank ?? -1));
}

/** Crypto tax help Railor links to. Railor has no tie to any of them. */
export const TAX_TOOLS = [
  { slug: "incometax", name: "Income Tax e-filing", url: "https://www.incometax.gov.in/iec/foportal/", what: "File your ITR. Report crypto sales in Schedule VDA and check TDS in Form 26AS / AIS." },
  { slug: "koinx", name: "KoinX", url: "https://koinx.com/in/crypto-tax-software", what: "Imports exchange history and builds a Schedule VDA report with a TDS summary." },
  { slug: "koinly", name: "Koinly", url: "https://koinly.io/in/", what: "Tracks gains across exchanges and wallets, including CoinDCX and WazirX." },
  { slug: "cleartax", name: "ClearTax", url: "https://cleartax.in/crypto-tax-filing", what: "Files the return, with crypto income under Schedule VDA." },
] as const;
