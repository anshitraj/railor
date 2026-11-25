import catalog from "../../../packages/core/src/public-pricing/transfer-provider-discovery.json";
import type { DirectoryProvider } from "../components/app/provider-directory";

export const transferProviderDiscovery = catalog;

export function discoveredTransferDirectory(): DirectoryProvider[] {
  return catalog.providers.map(provider => ({
    slug: provider.slug,
    name: provider.name,
    category: provider.category,
    description: "Check the provider’s website for current eligibility and prices.",
    products: [],
    assets: [],
    networks: [],
    countryCount: 0,
    currencyCount: 0,
    customerTypes: [],
    hasApi: false,
    hasSandbox: false,
    hasWebhooks: false,
    headquartersCountry: null,
    lastVerifiedAt: null,
    profileAvailable: false,
    sourceUrl: provider.website,
    sourceLabel: "Provider website",
  }));
}
