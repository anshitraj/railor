import Link from "next/link";
import { loadProviderSummaries, remittanceProviderDirectory, remittanceSurvey } from "@railor/core";
import { ProviderDirectory } from "../../../components/app/provider-directory";
import { SurveyProviderDirectory } from "../../../components/app/survey-provider-directory";
import { FeaturedProviders } from "../../../components/marketing/featured-providers";
import { requireSignedIn } from "../../../lib/sign-in-gate";
import { discoveredTransferDirectory } from "../../../lib/transfer-provider-discovery";
import { enrichDirectoryProvider } from "../../../lib/provider-directory-coverage";

export const metadata = { title: "Providers" };
export const dynamic = "force-dynamic";

export default async function PublicProvidersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  // The provider directory is for signed-in people: it is the first thing a scraper would read.
  await requireSignedIn(view === "infrastructure" || view === "directory" ? `/providers?view=${view}` : "/providers");
  const infrastructure = view === "infrastructure";
  const discovery = view === "directory";
  // Different sources: a dated consumer fee survey and Railor's verified
  // infrastructure graph. A survey entry does not imply route support.
  const providers = infrastructure ? (await loadProviderSummaries()).filter((p) => !p.isDemo) : [];
  const survey = infrastructure || discovery ? null : remittanceSurvey({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 });

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-[clamp(32px,4vw,48px)] font-[650] leading-[1.05] tracking-[-0.03em]">Providers</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--color-muted)]">
            {infrastructure
              ? "The payment infrastructure Railor maps for businesses: what each provider offers, where, and for whom — with sources."
              : discovery ? "Browse money transfer and business payment providers found in public research."
              : "Who each provider is for and what it charges. Start with the popular ones, or search every service in the global fee survey."}
          </p>
        </div>
        <nav aria-label="Provider catalogs" className="flex flex-wrap gap-1 rounded-2xl bg-[var(--color-surface)] p-1 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <Link href="/providers" aria-current={survey ? "page" : undefined} className={`inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold ${survey ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>Money transfer</Link>
          <Link href="/providers?view=infrastructure" aria-current={infrastructure ? "page" : undefined} className={`inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold ${infrastructure ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>Business infrastructure</Link>
          <Link href="/providers?view=directory" aria-current={discovery ? "page" : undefined} className={`inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold ${discovery ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>Provider discovery</Link>
        </nav>
      </header>

      {survey ? (
        <>
          <section aria-labelledby="popular-title">
            <h2 id="popular-title" className="mb-4 text-[22px] font-[650] tracking-[-0.02em]">Popular providers</h2>
            <FeaturedProviders />
          </section>

          <section aria-labelledby="all-title" className="border-t border-[var(--color-line)] pt-10">
            <div className="max-w-3xl">
              <h2 id="all-title" className="text-[22px] font-[650] tracking-[-0.02em]">Every provider in the global fee survey</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-muted)]">
                {survey.providersTracked} banks and money transfer services, with {survey.sampleCount.toLocaleString("en-US")} real fee samples collected by the World Bank ({survey.period}). Fees are dated examples — check the live comparison for today’s price.
              </p>
              <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">Source: <a href={survey.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">{survey.attribution}</a> · CC BY 4.0</p>
            </div>
            <SurveyProviderDirectory providers={remittanceProviderDirectory()} />
          </section>
        </>
      ) : discovery ? <ProviderDirectory basePath="/providers" providers={discoveredTransferDirectory()} /> : (
        <ProviderDirectory
          basePath="/providers"
          providers={providers.map((p) => enrichDirectoryProvider({
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
      )}
    </div>
  );
}
