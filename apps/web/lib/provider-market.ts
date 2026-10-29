import universe from "../../../RAILOR_PROVIDER_UNIVERSE.json";
import sourceAudit from "../../../packages/core/src/public-pricing/provider-source-audit.json";
import type { MarketCoverage, PriceCheckInput } from "@railor/core";
import { INDIA_RECEIVING_PRODUCTS } from "@railor/core";
import { discoveredCoverage, DISCOVERED_PROVIDERS } from "./corridor-discovery";

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
  return key ? (CATEGORY_LABELS[key] ?? key) : categories[0]?.toLowerCase().replaceAll("_", " ") ?? "Provider directory";
}

/**
 * Broader market coverage for a price request. Currency membership is useful
 * discovery evidence, but it is deliberately not treated as proof of an
 * atomic source-to-destination route or as a quote.
 */
export function providerMarketCoverage(input: PriceCheckInput): MarketCoverage {
  const source = input.sourceCurrency.toUpperCase();
  const destination = input.destinationCurrency.toUpperCase();
  const catalog = new Map((universe.providers as UniverseProvider[]).map((provider) => [provider.slug, { ...provider, currencies: [...provider.currencies] }]));
  for (const product of INDIA_RECEIVING_PRODUCTS) {
    const existing = catalog.get(product.slug);
    const currencies = [...new Set([...(existing?.currencies ?? []), ...product.currencies, "INR"])];
    catalog.set(product.slug, existing ? { ...existing, currencies } : { slug: product.slug, name: product.name, categories: ["DIRECT_PAYOUT_PROVIDER"], website: new URL(product.url).origin, currencies, lastVerified: "2026-10-29" });
  }
  for (const provider of sourceAudit.providers) {
    if (!catalog.has(provider.slug)) catalog.set(provider.slug, { slug: provider.slug, name: provider.name, categories: ["UNVERIFIED_PROVIDER"], website: provider.website, currencies: [], lastVerified: null });
  }
  for (const provider of DISCOVERED_PROVIDERS) {
    if (!catalog.has(provider.slug)) catalog.set(provider.slug, { slug: provider.slug, name: provider.name, categories: ["DIRECT_PAYOUT_PROVIDER"], website: provider.website, currencies: [], lastVerified: provider.reviewedAt });
  }
  const providers = [...catalog.values()].filter((provider) =>
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
      ...(INDIA_RECEIVING_PRODUCTS.find(product => product.slug === provider.slug) ? { pricingStatus: { label: "Published product information", reason: INDIA_RECEIVING_PRODUCTS.find(product => product.slug === provider.slug)!.fee } } : {}),
    }))
    .sort((a, b) => Number(b.currencyMatch === "both") - Number(a.currencyMatch === "both") || a.providerName.localeCompare(b.providerName));

  const discovered = discoveredCoverage(input);
  const known = discovered.filter(provider => provider.routeMatch);
  const bySlug = new Map([...matched, ...discovered].map((provider) => [provider.providerSlug, provider]));
  const allProviders = [...catalog.values()].map((provider) => bySlug.get(provider.slug) ?? {
    providerSlug: provider.slug, providerName: provider.name, websiteUrl: provider.website,
    category: primaryCategory(provider.categories), currencyMatch: "unverified" as const, lastVerified: provider.lastVerified,
    pricingStatus: { label: "Route unconfirmed", reason: "A complete price and eligibility for this route have not been verified. Currency support in a catalog is not a transfer quote." },
  }).sort((a, b) => Number("routeMatch" in b && b.routeMatch) - Number("routeMatch" in a && a.routeMatch) || Number(a.currencyMatch === "unverified") - Number(b.currencyMatch === "unverified") || a.providerName.localeCompare(b.providerName));
  const destinationProviders = [...matched.filter(provider => !discovered.some(item => item.providerSlug === provider.providerSlug)), ...known];
  return { totalTracked: catalog.size, matched: destinationProviders.length, providers: destinationProviders, allProviders };
}
