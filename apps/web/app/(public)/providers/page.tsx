import Link from "next/link";
import { loadProviderSummaries, remittanceProviderDirectory, remittanceSurvey } from "@railor/core";
import { ProviderDirectory } from "../../../components/app/provider-directory";
import { SurveyProviderDirectory } from "../../../components/app/survey-provider-directory";

export const metadata = { title: "Provider directory" };
export const dynamic = "force-dynamic";

export default async function PublicProvidersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const infrastructure = (await searchParams).view === "infrastructure";
  // These are different sources: a dated consumer fee survey and Railor's
  // verified infrastructure graph. A survey entry does not imply route support.
  const providers = infrastructure ? (await loadProviderSummaries()).filter((p) => !p.isDemo) : [];
  const survey = infrastructure ? null : remittanceSurvey({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 });

  return (
    <div className="space-y-6">
      <nav aria-label="Provider catalogs" className="flex flex-wrap gap-2">
        <Link href="/providers" aria-current={!infrastructure ? "page" : undefined} className={`rounded-full border px-4 py-2 text-[13px] font-semibold ${!infrastructure ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-line)] bg-[var(--color-surface)]"}`}>Surveyed fees · 400 entries</Link>
        <Link href="/providers?view=infrastructure" aria-current={infrastructure ? "page" : undefined} className={`rounded-full border px-4 py-2 text-[13px] font-semibold ${infrastructure ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-line)] bg-[var(--color-surface)]"}`}>Mapped payment infrastructure</Link>
      </nav>
      {survey ? <section>
        <h1 className="font-display text-[clamp(1.9rem,4vw,2.8rem)] font-semibold tracking-[-0.045em]">Provider directory</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-[var(--color-muted)]">Explore {survey.providersTracked} provider entries and {survey.sampleCount.toLocaleString("en-US")} original fee samples from the World Bank’s {survey.period} consumer remittance survey. Search a country or currency to see where samples were collected. These are dated observations, not prices for a new transfer.</p>
        <p className="mt-2 text-[12px] text-[var(--color-muted)]"><a href={survey.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{survey.attribution}</a> · CC BY 4.0 · Regional brands and services may appear as separate entries.</p>
        <SurveyProviderDirectory providers={remittanceProviderDirectory()} />
      </section> : <ProviderDirectory
      basePath="/providers"
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
    />}
    </div>
  );
}
