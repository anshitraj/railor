/**
 * Selling USDT or USDC for INR on an Indian exchange, priced from the
 * exchange's own public market data and its own published fee schedule
 * (re-read 2026-11-18). Where the exchange publishes its order book the quote
 * walks the live bids for the exact amount, so a large sale shows the price it
 * would really fill at, not the top bid; where it publishes only the best bid
 * (Flitpay) the whole amount is priced at that bid and the card says so. The
 * market data itself is read, checked and cached in @railor/core
 * (`inrExchangeRates`); this file holds what each exchange charges and takes.
 *
 *   CoinDCX   — coindcx.com/fees: Spot (INR) fee 0.50% at Regular 1 (< ₹2 lakh
 *               30-day volume), 18% GST on fees; INR withdrawal ₹0, min ₹100.
 *   WazirX    — wazirx.com/blog/revised-fee-structure-december-2025: Pay Per
 *               Trade INR market 0.40% at ₹0–5 lakh volume and < 500 WRX, GST
 *               extra; WazirX ZERO (₹99/month + GST) removes the trading fee.
 *               support.wazirx.com: INR withdrawal ₹10 incl. taxes, ₹500–₹2,00,000.
 *   Giottus   — giottus.com/docs/fees.html: 0.4% under ₹5 lakh of 30-day volume
 *               plus 18% GST; INR out free, ₹500 to ₹50,00,000.
 *   Flitpay   — flitpay.com/fees: 0.50% under ₹1 lakh, GST included; INR out ₹10
 *               standard (to ₹5,00,000) or ₹20 instant (to ₹50,000), from ₹100.
 *   ZebPay    — zebpay.com/in/features/pricing: 0.45% plus GST; INR out ₹15,
 *               ₹100 to ₹70,00,000.
 *   SunCrypto — suncrypto.in/fee-structure: 0.40% on INR pairs plus GST; INR out ₹10.
 *   Mudrex    — mudrex.com/fee: 1% on USDT sales plus GST; INR out free.
 *
 * SunCrypto is shown with its latest reported trade. Mudrex has a public
 * calculator, but the rate behind it is tagged BUY.
 *
 * Tax (incometaxindia.gov.in): 1% TDS under Section 194S on the consideration
 * net of the exchange's charges (CBDT Circular 13/2022); income from a VDA
 * transfer taxed at 30% plus surcharge and cess under Section 115BBH, with no
 * deduction except the cost of acquisition and no set-off of losses. TDS is a
 * credit against that tax.
 *
 * Railor only reads public prices. It never holds crypto or INR.
 */
import type { ExchangeTradeReference } from "@railor/core";
import type { Network, Stablecoin } from "./stablecoin-routes";

export type ExchangeSlug = "coindcx" | "wazirx" | "giottus" | "flitpay" | "zebpay" | "suncrypto" | "mudrex" | "koinbx" | "coinswitch";
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
  feeRate: number | null;
  /** True when the published fee already includes the 18% GST (Flitpay). */
  gstIncluded?: boolean;
  feeLabel: string;
  feeNote: string;
  feeSource: string;
  withdrawalFee: number | null;
  withdrawalMin: number | null;
  withdrawalMax?: number;
  withdrawalNote?: string;
  withdrawalSource: string;
  /** Provider-specific review date, when newer than the common fee review. */
  reviewedAt?: string;
  networks: Record<Stablecoin, { listed: Network[]; unknown?: Network[] | "all"; source: string; noNote: string; unknownNote: string }>;
  /** Tokens it lists against INR that Railor prices. Omitted: USDT and USDC. */
  assets?: Stablecoin[];
  /**
   * Why Railor shows no live price for this exchange: its public feed can't be
   * used. Absent when `inrExchangeRates` in core reads one.
   */
  noLivePrice?: string;
}

const COINDCX_CHAINS: Network[] = ["ethereum", "base", "arbitrum", "polygon", "bnb", "solana"];
const COINDCX_NETWORKS_SOURCE = "https://support.coindcx.com/articles/transfer/which-blockchain-networks-are-supported-for-transfers-between-coindcx-and-coindcx-web3/66d82d2b2b52180f6c097752";

/** For an exchange that lists USDT/INR only: USDC is never priced, so this is a placeholder that says so. */
const usdtOnly = (name: string, source: string): IndiaExchange["networks"]["USDC"] => ({ listed: [], unknown: "all", source, noNote: "", unknownNote: `${name} is priced for USDT only.` });

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
  },
  {
    slug: "giottus",
    name: "Giottus",
    site: "https://www.giottus.com",
    tradeUrl: () => "https://www.giottus.com/tradeview/usdt-inr",
    feeRate: 0.004,
    feeLabel: "0.40% trading fee",
    feeNote: "Under ₹5 lakh traded in 30 days, down to 0.05% with volume, plus 18% GST.",
    feeSource: "https://www.giottus.com/docs/fees.html",
    withdrawalFee: 0,
    withdrawalMin: 500,
    withdrawalMax: 5_000_000,
    withdrawalNote: "No fee; reaches your bank within 24 hours on working days.",
    withdrawalSource: "https://www.giottus.com/docs/fees.html",
    assets: ["USDT"],
    networks: {
      USDT: { listed: ["ethereum", "tron"], source: "https://www.giottus.com/docs/fees.html", noNote: "Not in Giottus’s published USDT network list (Ethereum, Tron and BNB Smart Chain)", unknownNote: "" },
      USDC: usdtOnly("Giottus", "https://www.giottus.com/docs/fees.html"),
    },
  },
  {
    slug: "flitpay",
    name: "Flitpay",
    site: "https://www.flitpay.com",
    tradeUrl: () => "https://www.flitpay.com/trade/USDT-INR",
    feeRate: 0.005,
    gstIncluded: true,
    feeLabel: "0.50% trading fee, GST included",
    feeNote: "Under ₹1 lakh traded in 30 days, down to 0.05% with volume. GST is already in the published fee.",
    feeSource: "https://www.flitpay.com/fees/trading-fees",
    withdrawalFee: 10,
    withdrawalMin: 100,
    withdrawalMax: 500_000,
    withdrawalNote: "₹10 standard (up to ₹5,00,000, within 3 working days); ₹20 for an instant one up to ₹50,000. The standard ₹10 is used here.",
    withdrawalSource: "https://www.flitpay.com/fees/deposit-withdrawal-fees",
    assets: ["USDT"],
    networks: {
      USDT: { listed: ["ethereum", "tron"], source: "https://www.flitpay.com/fees/deposit-withdrawal-fees", noNote: "Not in Flitpay’s published USDT network list (Tron, BNB Smart Chain and Ethereum)", unknownNote: "" },
      USDC: usdtOnly("Flitpay", "https://www.flitpay.com/fees/deposit-withdrawal-fees"),
    },
  },
  {
    slug: "zebpay",
    name: "ZebPay",
    site: "https://zebpay.com",
    tradeUrl: () => "https://zebpay.com/",
    feeRate: 0.0045,
    feeLabel: "0.45% trading fee",
    feeNote: "Entry tier, plus 18% GST. Quick Trade is 0.5% onwards.",
    feeSource: "https://zebpay.com/in/features/pricing",
    withdrawalFee: 15,
    withdrawalMin: 100,
    withdrawalMax: 7_000_000,
    withdrawalNote: "₹15 flat, up to 3 working days. USDT/INR orders run from ₹93 to ₹5,00,000.",
    withdrawalSource: "https://zebpay.com/in/features/pricing",
    assets: ["USDT"],
    networks: {
      USDT: { listed: ["ethereum", "tron"], source: "https://zebpay.com/in/features/pricing", noNote: "Not in ZebPay’s published USDT network list (Ethereum and Tron)", unknownNote: "" },
      USDC: usdtOnly("ZebPay", "https://zebpay.com/in/features/pricing"),
    },
  },
  {
    slug: "suncrypto",
    name: "SunCrypto",
    site: "https://suncrypto.in",
    tradeUrl: () => "https://suncrypto.in/",
    feeRate: 0.004,
    feeLabel: "0.40% trading fee",
    feeNote: "On INR pairs, plus 18% GST. Its 0.25% USDT-pair fee is crypto to crypto and never reaches rupees.",
    feeSource: "https://suncrypto.in/fee-structure",
    withdrawalFee: 10,
    withdrawalMin: null,
    withdrawalNote: "SunCrypto’s withdrawal guide lists a ₹10 banking-partner fee and up to 24–48 hours for bank processing. Confirm the current charge in the app.",
    withdrawalSource: "https://help.suncrypto.in/support/solutions/articles/82000885009-how-to-withdrawal-inr-",
    assets: ["USDT"],
    reviewedAt: "2026-11-20",
    networks: {
      USDT: { listed: ["tron", "ethereum", "bnb"], unknown: "all", source: "https://suncrypto.in/blog/suncrypto-announcements/how-to-deposit-crypto/", noNote: "", unknownNote: "Confirm the USDT network on SunCrypto’s deposit screen" },
      USDC: usdtOnly("SunCrypto", "https://suncrypto.in/fee-structure"),
    },
  },
  {
    slug: "mudrex",
    name: "Mudrex",
    site: "https://mudrex.com",
    tradeUrl: () => "https://mudrex.com/off-ramp/usdt",
    feeRate: 0.01,
    feeLabel: "1% trading fee",
    feeNote: "1% on USDT sales, plus 18% GST. Its fee page lists this; some Mudrex blog posts say USDT sales are free, so the fee page is the source.",
    feeSource: "https://mudrex.com/fee",
    withdrawalFee: 0,
    withdrawalMin: 500,
    withdrawalNote: "Free INR withdrawal. Mudrex lists a 5 USDT minimum sale and a ₹500 minimum withdrawal. It credits INR Funds first and advises allowing a few hours for bank receipt.",
    withdrawalSource: "https://mudrex.com/off-ramp/usdt",
    assets: ["USDT"],
    noLivePrice: "Mudrex’s public calculator reads a USDT buy rate. The app shows the sell rate before confirmation",
    reviewedAt: "2026-11-20",
    networks: {
      USDT: { listed: ["ethereum", "tron", "bnb"], source: "https://mudrex.com/off-ramp/usdt", noNote: "Outside Mudrex’s published USDT network list (Tron, Ethereum and BNB Smart Chain)", unknownNote: "" },
      USDC: usdtOnly("Mudrex", "https://mudrex.com/off-ramp/usdt"),
    },
  },
  {
    slug: "koinbx",
    name: "KoinBX",
    site: "https://koinbx.com",
    tradeUrl: () => "https://koinbx.com/markets",
    feeRate: null,
    feeLabel: "Reported taker fees",
    feeNote: "The public asset API reported 0.47% for USDT and 0.25% for USDC on 19 Nov 2026. Confirm the fee for your trade and whether it includes GST.",
    feeSource: "https://api.koinbx.com/asset",
    withdrawalFee: null,
    withdrawalMin: null,
    withdrawalNote: "KoinBX lists a ₹5,00,000 daily INR withdrawal limit for standard verified users. Check your account for the fee and current limit.",
    withdrawalSource: "https://koinbxsupport.freshdesk.com/support/solutions/articles/82000078256-1-how-much-can-i-deposit-withdraw-from-at-once-",
    reviewedAt: "2026-11-20",
    networks: {
      USDT: { listed: [], unknown: "all", source: "https://koinbx.com/publicapi", noNote: "", unknownNote: "Check which USDT networks accept deposits in your KoinBX account" },
      USDC: { listed: [], unknown: "all", source: "https://koinbx.com/publicapi", noNote: "", unknownNote: "Check which USDC networks accept deposits in your KoinBX account" },
    },
  },
  {
    slug: "coinswitch",
    name: "CoinSwitch PRO",
    site: "https://coinswitch.co",
    tradeUrl: () => "https://coinswitch.co/pro/usdt-inr/csx",
    assets: ["USDT"],
    feeRate: null,
    feeLabel: "0.10% published standard taker fee",
    feeNote: "CoinSwitch publishes a 0.10% standard spot taker fee. Check applicable fees and tax in the trade preview.",
    feeSource: "https://coinswitch.co/switch/crypto/crypto-coinswitch-pro-review/",
    withdrawalFee: null,
    withdrawalMin: 100,
    withdrawalNote: "CoinSwitch lists INR bank withdrawals from ₹100 up to ₹5,00,000 per day. Check your account for the current fee and limits.",
    withdrawalSource: "https://coinswitch.co/switch/crypto/crypto-to-cash-withdrawals/",
    reviewedAt: "2026-11-20",
    networks: {
      USDT: { listed: [], unknown: "all", source: "https://coinswitch.co/pro/crypto-deposit", noNote: "", unknownNote: "CoinSwitch PRO verifies ownership of the sending wallet. Check whether your approved account accepts USDT on this network" },
      USDC: usdtOnly("CoinSwitch PRO", "https://coinswitch.co/pro/crypto-deposit"),
    },
  },
];

export function exchangeBySlug(slug: string) {
  return INDIA_EXCHANGES.find((exchange) => exchange.slug === slug);
}

/** The exchanges that list this token against INR. */
export function exchangesFor(asset: Stablecoin) {
  return INDIA_EXCHANGES.filter((exchange) => !exchange.assets || exchange.assets.includes(asset));
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
export function exchangeCharges(exchange: Pick<IndiaExchange, "feeRate" | "withdrawalFee" | "gstIncluded">, gross: number): ExchangeBreakdown {
  if (exchange.feeRate === null || exchange.withdrawalFee === null) throw new Error("A sale breakdown requires known trade and withdrawal fees.");
  const tradingFee = paise(gross * exchange.feeRate);
  const gst = exchange.gstIncluded ? 0 : paise(tradingFee * GST_RATE);
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

/** The exchange's live bid behind a quote: a market reference, not a quote. */
export interface LiveBid {
  /** Best bid, INR per token. */
  bid: number;
  ask: number | null;
  /** The exchange's own timestamp, or Railor's read time when the exchange sends none (`clock`). */
  observedAt: string;
  clock: "exchange" | "railor";
  /** "book": the quote walked the order book. "top": the exchange publishes only its best bid, so the whole amount is priced at it. */
  depth: "book" | "top";
  /** Percent above (+) or below (−) Wise's mid-market USD/INR rate. */
  gapPct: number | null;
  /** That mid-market rate. */
  referenceRate: number | null;
  source: { label: string; url: string };
}

export interface ExchangeQuote {
  slug: ExchangeSlug;
  name: string;
  support: { status: DepositSupport; note: string };
  status: "priced" | "market_reference" | "last_trade" | "unavailable";
  reason?: string;
  fill?: BookFill;
  breakdown?: ExchangeBreakdown;
  live?: LiveBid;
  trade?: ExchangeTradeReference;
  belowMinimum?: boolean;
  aboveMaximum?: boolean;
  checkedAt: string;
}

export function isBankPayoutEstimate(quote: ExchangeQuote) {
  return quote.status === "priced" && quote.support.status === "yes" && !!quote.breakdown
    && Number.isFinite(quote.breakdown.inBank) && quote.breakdown.inBank > 0
    && quote.live?.depth === "book" && !quote.fill?.short && !quote.belowMinimum && !quote.aboveMaximum;
}

/** Crypto tax help Railor links to. Railor has no tie to any of them. */
export const TAX_TOOLS = [
  { slug: "incometax", name: "Income Tax e-filing", url: "https://www.incometax.gov.in/iec/foportal/", what: "File your ITR. Report crypto sales in Schedule VDA and check TDS in Form 26AS / AIS." },
  { slug: "koinx", name: "KoinX", url: "https://koinx.com/in/crypto-tax-software", what: "Imports exchange history and builds a Schedule VDA report with a TDS summary." },
  { slug: "koinly", name: "Koinly", url: "https://koinly.io/in/", what: "Tracks gains across exchanges and wallets, including CoinDCX and WazirX." },
  { slug: "cleartax", name: "ClearTax", url: "https://cleartax.in/crypto-tax-filing", what: "Files the return, with crypto income under Schedule VDA." },
] as const;
