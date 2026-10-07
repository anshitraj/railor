import Link from "next/link";
import { loadProviderSummaries, remittanceProviderCatalog } from "@railor/core";
import { ProviderDirectory } from "../../../components/app/provider-directory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Providers" };

export default async function ProvidersPage() {
  // Real companies only, like search and decisions: fictional demo providers stay out of the directory.
  const providers = (await loadProviderSummaries()).filter((p) => !p.isDemo);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-[13px]">
        <p className="font-semibold">Looking for the expanded fee survey?</p>
        <p className="mt-1 text-[var(--color-muted)]">Browse {remittanceProviderCatalog().length} surveyed provider entries with dated fee samples across many countries. These records are separate from the verified payment infrastructure below.</p>
        <Link href="/providers" className="mt-2 inline-block font-semibold text-[var(--color-orange-deep)]">Explore surveyed provider fees →</Link>
      </div>
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
    </div>
  );
}
