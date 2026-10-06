import universe from "../../../RAILOR_PROVIDER_UNIVERSE.json";
import type { MarketCoverage, PriceCheckInput } from "@railor/core";

interface UniverseProvider {
  slug: string;
  name: string;
  categories: string[];
  website: string | null;
  currencies: string[];
  lastVerified: string | null;
}

const PRICE_MARKET_CATEGORIES = new Set([
  "DIRECT_PAYOUT_PROVIDER",
  "LOCAL_PAYOUT_PROVIDER",
  "LOCAL_RAIL_OPERATOR",
  "AGGREGATOR",
  "OFFRAMP",
  "ONRAMP",
  "MOBILE_MONEY",
  "BANKING_INFRA",
  "FX_LIQUIDITY",
  "PAYMENT_NETWORK",
  "STABLECOIN_INFRA",
]);

const CATEGORY_LABELS: Record<string, string> = {
  DIRECT_PAYOUT_PROVIDER: "Payout provider",
  LOCAL_PAYOUT_PROVIDER: "Local payout provider",
  LOCAL_RAIL_OPERATOR: "Local rail operator",
  AGGREGATOR: "Payment aggregator",
  OFFRAMP: "Off-ramp",
  ONRAMP: "On-ramp",
  MOBILE_MONEY: "Mobile money",
  BANKING_INFRA: "Banking infrastructure",
  FX_LIQUIDITY: "FX provider",
  PAYMENT_NETWORK: "Payment network",
  STABLECOIN_INFRA: "Stablecoin infrastructure",
};

function primaryCategory(categories: string[]) {
  const key = categories.find((category) => PRICE_MARKET_CATEGORIES.has(category));
  return key ? (CATEGORY_LABELS[key] ?? key) : "Payment provider";
}

/**
 * Broader market coverage for a price request. Currency membership is useful
 * discovery evidence, but it is deliberately not treated as proof of an
 * atomic source-to-destination route or as a quote.
 */
export function providerMarketCoverage(input: PriceCheckInput): MarketCoverage {
  const source = input.sourceCurrency.toUpperCase();
  const destination = input.destinationCurrency.toUpperCase();
  const providers = (universe.providers as UniverseProvider[]).filter((provider) =>
    provider.categories.some((category) => PRICE_MARKET_CATEGORIES.has(category)),
  );

  const matched = providers
    .filter((provider) => provider.currencies.includes(destination))
    .map((provider) => ({
      providerSlug: provider.slug,
      providerName: provider.name,
      websiteUrl: provider.website,
      category: primaryCategory(provider.categories),
      currencyMatch: provider.currencies.includes(source) ? ("both" as const) : ("destination" as const),
      lastVerified: provider.lastVerified,
    }))
    .sort((a, b) => Number(b.currencyMatch === "both") - Number(a.currencyMatch === "both") || a.providerName.localeCompare(b.providerName));

  return { totalTracked: providers.length, matched: matched.length, providers: matched };
}
