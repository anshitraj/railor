import Link from "next/link";
import { INDIA_RECEIVING_PRODUCTS, loadProviderSummaries, remittanceProviderCatalog } from "@railor/core";
import audit from "../../../../../packages/core/src/public-pricing/provider-source-audit.json";
import discovery from "../../../../../packages/core/src/public-pricing/corridor-discovery.json";
import pricingReview from "../../../../../packages/core/src/public-pricing/provider-pricing-review.json";
import { ProviderDirectory, type DirectoryProvider } from "../../../components/app/provider-directory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Providers" };

export default async function ProvidersPage() {
  // Real companies only, like search and decisions: fictional demo providers stay out of the directory.
  const providers = (await loadProviderSummaries()).filter((p) => !p.isDemo);
  const directory: DirectoryProvider[] = providers.map(p => ({ ...p,
    lastVerifiedAt: p.lastVerifiedAt?.toISOString() ?? null,
    profileAvailable: true,
    sourceUrl: INDIA_RECEIVING_PRODUCTS.find(product => product.slug === p.slug)?.url ?? pricingReview.providers.find(entry => entry.slug === p.slug)?.sourceUrl ?? undefined,
    pricingSummary: pricingReview.providers.find(entry => entry.slug === p.slug)?.summary ?? INDIA_RECEIVING_PRODUCTS.find(product => product.slug === p.slug)?.fee,
  }));
  // Public-source discoveries are searchable too, without inventing graph facts or dead profile links.
  for (const provider of audit.providers) if (!directory.some(entry => entry.slug === provider.slug)) {
    const evidence = discovery.providers.find(entry => entry.slug === provider.slug);
    directory.push({ slug: provider.slug, name: provider.name, category: "Public-source research",
      description: evidence?.pricingNote ?? "Explore the official source for current products, account eligibility and pricing.",
      products: [], assets: [], networks: [], countryCount: 0, currencyCount: 0, customerTypes: [],
      hasApi: false, hasSandbox: false, hasWebhooks: false, headquartersCountry: null, lastVerifiedAt: null,
      profileAvailable: false, sourceUrl: pricingReview.providers.find(entry => entry.slug === provider.slug)?.sourceUrl ?? provider.website ?? undefined,
      pricingSummary: pricingReview.providers.find(entry => entry.slug === provider.slug)?.summary ?? undefined,
    });
  }

  return (
    <div className="space-y-5">
      <ProviderDirectory providers={directory} />
      <p className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-muted)]"><Link href="/docs/pricing" className="inline-flex min-h-8 items-center hover:text-[var(--color-orange-deep)]">Pricing & source methodology ↗</Link><Link href="/providers" className="inline-flex min-h-8 items-center hover:text-[var(--color-orange-deep)]">Historical fee survey · {remittanceProviderCatalog().length} entries ↗</Link></p>
    </div>
  );
}
