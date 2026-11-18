/**
 * Stablecoin routes, built only from first-party sources (re-read 2026-11-18):
 *   tokens    — Circle's USDC and EURC contract lists; Tether's supported protocols
 *   swaps     — Uniswap's documented prefill link; Titan's swap app on Solana
 *   off-ramps — Xflow's stablecoin collections; XEROF's Ethereum-funded INR payouts (read
 *               rendered on 2026-11-18); Tether and Circle issuer redemption. The Indian
 *               exchanges that sell USDT or USDC for INR are priced separately (india-exchanges.ts).
 *
 * Railor never converts a stablecoin at 1:1 itself. USDT, USDC and EURC each
 * trade at their own market price; redemption at par is a product of the
 * issuer, open only to verified accounts with their own fees and minimums.
 * Funds, keys, conversion and settlement stay with the provider.
 */
export type Stablecoin = "USDT" | "USDC";
export type Network = "ethereum" | "base" | "arbitrum" | "optimism" | "polygon" | "avalanche" | "bnb" | "arc" | "solana" | "tron" | "ton" | "aptos";
export const CASH_OUT_CURRENCIES = {
  EUR: { name: "Euro", flag: "EU" },
  USD: { name: "US dollar", flag: "US" },
  GBP: { name: "British pound", flag: "GB" },
  CAD: { name: "Canadian dollar", flag: "CA" },
  AUD: { name: "Australian dollar", flag: "AU" },
  CHF: { name: "Swiss franc", flag: "CH" },
} as const;
export type CashOutCurrency = keyof typeof CASH_OUT_CURRENCIES;
export const CASH_PICKUP_CURRENCIES = {
  MXN: { name: "Mexican peso", flag: "MX" },
  BRL: { name: "Brazilian real", flag: "BR" },
  COP: { name: "Colombian peso", flag: "CO" },
  PHP: { name: "Philippine peso", flag: "PH" },
} as const;
export type CashPickupCurrency = keyof typeof CASH_PICKUP_CURRENCIES;
export type Destination = "INR" | CashOutCurrency | CashPickupCurrency | "EURC";
export const DESTINATIONS: Destination[] = ["INR", ...Object.keys(CASH_OUT_CURRENCIES) as CashOutCurrency[], ...Object.keys(CASH_PICKUP_CURRENCIES) as CashPickupCurrency[], "EURC"];

export function isCashOutCurrency(value: string): value is CashOutCurrency {
  return Object.hasOwn(CASH_OUT_CURRENCIES, value);
}

export function isCashPickupCurrency(value: string): value is CashPickupCurrency {
  return Object.hasOwn(CASH_PICKUP_CURRENCIES, value);
}

export const STABLECOIN_CHECKED = "2026-11-19";

/** Every network Railor shows, in picker order. A token is only offered where its issuer lists it. */
export const NETWORKS: Record<Network, { label: string; family: "evm" | "solana" | "tron" | "other"; color: string; uniswap?: string }> = {
  ethereum: { label: "Ethereum", family: "evm", color: "#627eea", uniswap: "ethereum" },
  base: { label: "Base", family: "evm", color: "#0052ff", uniswap: "base" },
  arbitrum: { label: "Arbitrum", family: "evm", color: "#28a0f0", uniswap: "arbitrum" },
  optimism: { label: "OP Mainnet", family: "evm", color: "#ff0420", uniswap: "optimism" },
  polygon: { label: "Polygon", family: "evm", color: "#8247e5", uniswap: "polygon" },
  avalanche: { label: "Avalanche", family: "evm", color: "#e84142", uniswap: "avalanche" },
  bnb: { label: "BNB Chain", family: "evm", color: "#f0b90b", uniswap: "bnb" },
  arc: { label: "Arc", family: "evm", color: "#1a1a1a" },
  solana: { label: "Solana", family: "solana", color: "#14f195" },
  tron: { label: "Tron", family: "tron", color: "#eb0029" },
  ton: { label: "TON", family: "other", color: "#0098ea" },
  aptos: { label: "Aptos", family: "other", color: "#2ed8a7" },
};
export const ALL_NETWORKS = Object.keys(NETWORKS) as Network[];

/** Issuer-published addresses (Tether's supported protocols; Circle's USDC and EURC lists). A token missing here is not offered on that network. */
export const TOKENS: Record<Stablecoin | "EURC", { issuer: string; source: string; addresses: Partial<Record<Network, string>> }> = {
  USDT: {
    issuer: "Tether",
    source: "https://tether.to/en/supported-protocols/",
    addresses: {
      ethereum: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      avalanche: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
      solana: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      tron: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      ton: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
      aptos: "0xf73e887a8754f540ee6e1a93bdc6dde2af69fc7ca5de32013e89dd44244473cb",
    },
  },
  USDC: {
    issuer: "Circle",
    source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    addresses: {
      ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      arc: "0x3600000000000000000000000000000000000000",
      solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      aptos: "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
    },
  },
  EURC: {
    issuer: "Circle",
    source: "https://developers.circle.com/stablecoins/eurc-contract-addresses",
    addresses: {
      ethereum: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
      base: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
      avalanche: "0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD",
      arc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
      solana: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
    },
  },
};

/** Why a token isn't offered on a network, in the issuer's terms. */
export function notIssuedReason(asset: Stablecoin, network: Network): string {
  const label = NETWORKS[network].label;
  const issued = networksFor(asset).map((value) => NETWORKS[value].label).join(", ");
  if (asset === "USDT" && (network === "bnb" || network === "polygon" || network === "arbitrum" || network === "base" || network === "optimism"))
    return `Tether doesn’t issue USDT on ${label}. USDT there is a bridged copy, not Tether’s own token. Tether issues it on ${issued}.`;
  if (asset === "USDC" && network === "bnb") return `Circle doesn’t issue USDC on BNB Chain; tokens there are bridged copies. Circle issues it on ${issued}.`;
  return `${TOKENS[asset].issuer} doesn’t list ${asset} on ${label}. It does on ${issued}.`;
}

/** The stablecoin view's starting state from the URL; anything unexpected falls back to a default. */
export function stablecoinInitial(params: Record<string, string | undefined>): { asset: Stablecoin; network: Network | null; destination: Destination; amount: number } {
  const asset: Stablecoin = params.asset?.toUpperCase() === "USDC" ? "USDC" : "USDT";
  const network = params.network && Object.hasOwn(NETWORKS, params.network) ? (params.network as Network) : null;
  const target = params.dest?.toUpperCase() ?? "INR";
  const destination = target === "EURC" || isCashOutCurrency(target) || isCashPickupCurrency(target) ? target : "INR";
  const amount = Math.min(10_000_000, Math.max(0, Number(params.amount) || 1_000));
  return { asset, network, destination, amount };
}

export function networksFor(asset: Stablecoin): Network[] {
  return (Object.keys(NETWORKS) as Network[]).filter((network) => TOKENS[asset].addresses[network]);
}

export type SwapOption =
  | { kind: "uniswap"; name: "Uniswap"; url: string; network: Network; prefilled: true }
  | { kind: "titan"; name: "Titan"; url: string; network: "solana"; prefilled: false; mints: { from: string; to: string } }
  | { kind: "none"; reason: string };

/**
 * Where to swap a stablecoin for EURC on the network it's already on.
 * Uniswap documents prefill parameters (chain, inputCurrency, outputCurrency,
 * value, field), so its link opens with the swap filled in. Titan documents
 * no prefill link, so it opens on the swap page and the mints are shown.
 */
export function swapOption(asset: Stablecoin, network: Network, amount: number): SwapOption {
  const from = TOKENS[asset].addresses[network];
  const to = TOKENS.EURC.addresses[network];
  const label = NETWORKS[network].label;
  if (!from) return { kind: "none", reason: `${TOKENS[asset].issuer} doesn’t list ${asset} on ${label}.` };
  if (!to) {
    const both = (Object.keys(TOKENS.EURC.addresses) as Network[]).filter((value) => TOKENS[asset].addresses[value]).map((value) => NETWORKS[value].label);
    return { kind: "none", reason: `Circle doesn’t issue EURC on ${label}. ${asset} and EURC are both issued on ${both.join(", ")}.` };
  }
  if (network === "solana") return { kind: "titan", name: "Titan", url: "https://app.titan.exchange/swap", network, prefilled: false, mints: { from, to } };
  const chain = NETWORKS[network].uniswap;
  if (!chain) return { kind: "none", reason: `No verified swap link for ${label} yet.` };
  const params = new URLSearchParams({ chain, inputCurrency: from, outputCurrency: to });
  if (amount > 0 && Number.isFinite(amount)) {
    params.set("value", String(amount));
    params.set("field", "input");
  }
  return { kind: "uniswap", name: "Uniswap", url: `https://app.uniswap.org/swap?${params}`, network, prefilled: true };
}

export interface RouteCard {
  id: string;
  provider: string;
  /** For the provider logo. */
  slug: string;
  title: string;
  /** What lands, in plain words. */
  delivers: string;
  points: string[];
  /** Never a computed INR or EURC amount: either "Price on request" or a published fee. */
  price: string;
  priceNote: string;
  /** A caveat for this exact selection, e.g. a network the provider names only generically. */
  caution?: string;
  sourceUrl: string;
  checkedAt: string;
}

const XFLOW_NAMED: Network[] = ["solana", "tron", "ethereum", "polygon"];

function usd(value: number) {
  return `USD ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Verified ways out of a stablecoin, for the destination chosen. */
export function stablecoinRoutes(asset: Stablecoin, network: Network, destination: Destination, amount: number): RouteCard[] {
  const cards: RouteCard[] = [];
  if (isCashOutCurrency(destination)) return [];
  if (asset === "USDC" && network === "solana" && (destination === "INR" || isCashPickupCurrency(destination))) {
    cards.push({
      id: "moneygram-ramps",
      slug: "moneygram",
      provider: "MoneyGram",
      title: "Wallet cash-out · MoneyGram Ramps",
      delivers: destination + " cash pickup at a participating agent, subject to the wallet’s payout options",
      price: "Quote in supported wallet",
      priceNote: "FX rate and fees are shown by the wallet before confirmation.",
      points: [
        "Deposit asset: native USDC on Solana. Start in a wallet that offers MoneyGram Ramps.",
        "The wallet quote shows the payout currency, FX rate, MoneyGram and wallet partner fees before confirmation.",
        "MoneyGram verifies identity. Confirm the pickup location, ID requirements and local limits in the wallet.",
        "Wallet network charges and personal taxes depend on the transaction and your circumstances.",
      ],
      sourceUrl: "https://xramps.moneygram.com/",
      checkedAt: STABLECOIN_CHECKED,
    });
  }
  if (isCashPickupCurrency(destination)) return cards;
  if (destination === "INR") {
    cards.push({
      id: "xflow-stablecoins",
      provider: "Xflow",
      slug: "xflow",
      title: "Stablecoin collections, settled in INR",
      delivers: "INR in your Indian bank account",
      points: [
        "Accepts USDC and USDT on Solana, Tron and EVM chains (Xflow names Ethereum and Polygon).",
        "Converted to USD outside India; INR settles T+2 with an e-FIRA from an AD Category I bank.",
        "Offered through Xflow’s platform partners, subject to their onboarding and approval.",
      ],
      price: "Price on request",
      priceNote: "Xflow doesn’t publish stablecoin fees or its conversion rate.",
      ...(XFLOW_NAMED.includes(network) ? {} : { caution: NETWORKS[network].family === "evm" ? `${NETWORKS[network].label} is an EVM chain Xflow doesn’t name. Confirm it before sending.` : `Xflow doesn’t name ${NETWORKS[network].label}. Confirm it before sending.` }),
      sourceUrl: "https://www.xflowpay.com/products/stablecoins",
      checkedAt: STABLECOIN_CHECKED,
    });
    // XEROF funds a payout with USDT or USDC on Ethereum only, so it is a route only there. It also pays
    // fiat EUR over SEPA, but that is a bank payout, not EURC, so the EURC destination has no XEROF route.
    if (network === "ethereum") {
      cards.push({
        id: "xerof-payouts",
        provider: "XEROF",
        slug: "xerof",
        title: "Stablecoin payout to an Indian bank account",
        delivers: "INR in a bank account in India",
        points: [
          "Funded with USDT or USDC on Ethereum (ERC-20) only. Tron, Solana, Polygon and other networks can’t fund a payout.",
          "Pays INR by local bank transfer. Trade payments up to INR 1,500,000 per invoice; person-to-person payments up to INR 500,000,000.",
          "Swiss-regulated brokerage. Needs a XEROF account, the beneficiary’s IFSC and account number, the invoice for a trade payment and an RBI purpose code.",
        ],
        price: "Price on request",
        priceNote: "XEROF’s brokerage fee is 1.00% at the entry tier, plus 0.25% to pay someone else. It quotes the INR leg per payment, so no INR total is published.",
        sourceUrl: "https://xerof.com/payouts/india",
        checkedAt: STABLECOIN_CHECKED,
      });
    }
  }
  if (asset === "USDT" && destination === "INR") {
    const below = amount < 100_000;
    cards.push({
      id: "tether-redemption",
      provider: "Tether",
      slug: "tether",
      title: "Redeem with the issuer",
      delivers: "US dollars, not INR, to a verified bank account",
      points: [
        "Verified Tether accounts only, at Tether’s discretion. Verification costs USD 150 in USDT and isn’t refunded.",
        "Minimum redemption USD 100,000. Fee: the greater of USD 1,000 or 0.1%.",
        "You still need a bank route to bring the dollars to India.",
      ],
      price: below ? "Below the USD 100,000 minimum" : `Fee ${usd(Math.max(1_000, Math.round(amount * 0.001 * 100) / 100))}`,
      priceNote: below ? "Use a provider route for smaller amounts." : "Published redemption fee. Bank and transfer costs to India are extra.",
      sourceUrl: "https://tether.to/en/fees/",
      checkedAt: STABLECOIN_CHECKED,
    });
  }
  if (asset === "USDC") {
    cards.push({
      id: "circle-mint",
      provider: "Circle",
      slug: "circle",
      title: destination === "EURC" ? "Circle Mint: USDC to EURC" : "Circle Mint redemption",
      delivers: destination === "EURC" ? "EURC from the issuer, for qualifying businesses" : "US dollars, not INR, to a business bank account",
      points: [
        "For institutions that qualify as Circle Mint distributors. Not available to individuals.",
        destination === "EURC" ? "Trades between USDC and EURC inside Circle Mint, with a lockable rate on supported pairs." : "USDC redeems 1:1 for US dollars through Circle, by wire.",
        "Background, KYC and sanctions checks first; approval can take a day to a week or more.",
      ],
      price: "Price on request",
      priceNote: "Circle doesn’t publish Mint fees on this page.",
      sourceUrl: "https://www.circle.com/circle-mint",
      checkedAt: STABLECOIN_CHECKED,
    });
  }
  return cards;
}
