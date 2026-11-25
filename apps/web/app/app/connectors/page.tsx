import { loadProviderSummaries } from "@railor/core";
import audit from "../../../../../packages/core/src/public-pricing/provider-source-audit.json";
import discovery from "../../../../../packages/core/src/public-pricing/corridor-discovery.json";
import { ConnectorCatalog } from "../../../components/app/connector-catalog";
import { buildConnectionCatalog, type ConnectionProvider } from "../../../lib/connection-catalog";
import { connectionProviderSlug } from "../../../lib/connection-navigation";

export const metadata = { title: "Connectors" };

export default async function ConnectorsPage() {
  const providers = (await loadProviderSummaries()).filter((provider) => !provider.isDemo);
  const catalog = new Map<string, ConnectionProvider>();
  for (const provider of providers) {
    const slug = connectionProviderSlug(provider.slug);
    catalog.set(slug, { ...provider, slug, id: null, docsUrl: null });
  }
  for (const provider of [...discovery.providers, ...audit.providers]) {
    const slug = connectionProviderSlug(provider.slug);
    if (!catalog.has(slug)) {
      catalog.set(slug, { slug, name: provider.name, category: "Payment provider", description: "", id: null, docsUrl: null });
    }
  }
  const rows = buildConnectionCatalog([...catalog.values()])
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ slug, name, category, description }) => ({ slug, name, category, description }));
  return <ConnectorCatalog providers={rows} />;
}
