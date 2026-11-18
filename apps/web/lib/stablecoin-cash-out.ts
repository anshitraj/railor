import { NETWORKS, type CashOutCurrency, type Network, type Stablecoin } from "./stablecoin-routes";

export const KRAKEN_FEES = "https://www.kraken.com/pro/fees";
export const KRAKEN_WITHDRAWALS = "https://support.kraken.com/articles/360000423043-cash-withdrawal-options-fees-minimums-and-processing-times-";
export const KRAKEN_NETWORKS = "https://support.kraken.com/articles/stablecoins-supported-on-kraken";
export const KRAKEN_EEA = "https://support.kraken.com/articles/stablecoin-offerings-for-eea-clients";
export const KRAKEN_CANADA = "https://support.kraken.com/articles/trading-suspension-in-canada-for-usdt-dai-weth-wbtc-and-waxl";
export const KRAKEN_TAKER_RATE = 0.002;
export const KRAKEN_TRADE_MINIMUM = 5;

export const CASH_OUT_RAILS: Record<CashOutCurrency, {
  method: string;
  availability: string;
  timing: string;
  minimum: number;
  flatFee: number;
  feeRate?: number;
  taxGuide?: { label: string; url: string };
}> = {
  EUR: { method: "SEPA (Bank Frick)", availability: "Eligible Kraken accounts with a SEPA-reachable bank account", timing: "0–5 business days", minimum: 2, flatFee: 1 },
  USD: { method: "ACH", availability: "Verified US Kraken accounts outside Maine and New York with a linked US bank account in the same legal name", timing: "0–2 business days", minimum: 1, flatFee: 0,
    taxGuide: { label: "US digital asset tax guidance", url: "https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-digital-asset-transactions" } },
  GBP: { method: "Faster Payments (Openpayd)", availability: "Eligible UK Kraken accounts with a supported UK bank account", timing: "Usually near-instant", minimum: 5, flatFee: 1.95,
    taxGuide: { label: "UK cryptoasset tax guidance", url: "https://www.gov.uk/guidance/check-if-you-need-to-pay-tax-when-you-sell-cryptoassets" } },
  CAD: { method: "EFT", availability: "Eligible Canadian Kraken accounts with a Canadian bank account", timing: "2–5 business days", minimum: 50, flatFee: 0, feeRate: 0.0035,
    taxGuide: { label: "Canadian cryptoasset tax guidance", url: "https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/cryptocurrency-guide/income-crypto-transactions.html" } },
  AUD: { method: "Bank transfer", availability: "Eligible Australian Kraken accounts with an Australian bank account", timing: "0–2 business days", minimum: 5, flatFee: 0,
    taxGuide: { label: "Australian cryptoasset tax guidance", url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/how-to-work-out-and-report-cgt-on-crypto" } },
  CHF: { method: "SIC (Bank Frick)", availability: "Eligible Kraken accounts in Switzerland and Liechtenstein", timing: "Usually same business day", minimum: 2, flatFee: 1,
    taxGuide: { label: "Swiss cryptoasset tax guidance", url: "https://www.estv.admin.ch/de/kryptowaehrungen-besteuerung" } },
};

const KRAKEN_NETWORK_LIST: Record<Stablecoin, readonly Network[]> = {
  USDC: ["ethereum", "base", "arbitrum", "optimism", "polygon", "avalanche", "solana"],
  USDT: ["ethereum", "avalanche", "solana", "tron", "ton"],
};

export function cashOutRestriction(asset: Stablecoin, network: Network, destination: CashOutCurrency) {
  if (destination === "EUR" && asset === "USDT") return "Railor prices EUR bank payouts with USDC. Kraken delisted USDT for European Economic Area clients; switch to USDC to see the SEPA estimate.";
  if (destination === "CAD" && asset === "USDT") return "Kraken suspended USDT trading in Canada. Switch to USDC to see the Canadian bank payout estimate.";
  if (!KRAKEN_NETWORK_LIST[asset].includes(network)) return `Kraken does not list ${asset} deposits on ${NETWORKS[network].label}. Choose a supported network.`;
  return null;
}

export interface CashOutQuote {
  gross: number;
  tradingFee: number;
  withdrawalFee: number;
  payout: number;
  averagePrice: number;
  observedAt: string;
}

export type CashOutResponse =
  | { locked: true }
  | { locked: false; quote: CashOutQuote | null; reason?: string };

export const fiat = (value: number, currency: CashOutCurrency) =>
  new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code" }).format(value);
