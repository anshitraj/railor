import { loadProviderSummaries } from "@railor/core";
import { ProviderDirectory } from "../../../components/app/provider-directory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Providers" };

export default async function ProvidersPage() {
  // Real companies only, like search and decisions: fictional demo providers stay out of the directory.
  const providers = (await loadProviderSummaries()).filter((p) => !p.isDemo);

  return (
    <ProviderDirectory
      providers={providers.map((p) => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        description: p.description,
        products: p.products,
        assets: p.assets,
        networks: p.networks,
        countryCount: p.countryCount,
        currencyCount: p.currencyCount,
        customerTypes: p.customerTypes,
        hasApi: p.hasApi,
        hasSandbox: p.hasSandbox,
        hasWebhooks: p.hasWebhooks,
        headquartersCountry: p.headquartersCountry,
        lastVerifiedAt: p.lastVerifiedAt?.toISOString() ?? null,
      }))}
    />
  );
}
