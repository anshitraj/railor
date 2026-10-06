import publicProviders from "../../../PUBLIC_PRICING_PROVIDERS.json";
import { connectionProviderSlug } from "./connection-navigation";

export interface ConnectionProvider {
  id: string | null;
  slug: string;
  name: string;
  category: string;
  description: string;
  docsUrl: string | null;
  pricingSourceUrl?: string;
}

/** Discovery entries never create credential slots or assert a commercial partnership. */
export function buildConnectionCatalog(registered: ConnectionProvider[]): ConnectionProvider[] {
  const catalog = new Map(registered.map((provider) => [connectionProviderSlug(provider.slug), provider]));
  for (const provider of publicProviders.providers) {
    const slug = connectionProviderSlug(provider.slug);
    if (catalog.has(slug)) continue;
    catalog.set(slug, {
      id: null,
      slug,
      name: slug === "revolut" ? "Revolut" : provider.name,
      category: provider.type === "bank" ? "Bank" : "Payment provider",
      description: provider.notes,
      docsUrl: null,
      pricingSourceUrl: provider.sourceUrl,
    });
  }
  return [...catalog.values()];
}
