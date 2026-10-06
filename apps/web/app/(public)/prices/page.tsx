import { getSession } from "../../../lib/auth";
import { loadPricePage } from "../../../lib/pricing";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceLabelsCard, PriceToolsNav } from "../../../components/app/price-panels";
import { SwapQuote } from "../../../components/app/swap-quote";
import { ProviderFeatureComparison } from "../../../components/app/provider-feature-comparison";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cross-border price intelligence",
  description: "What actually arrives through Wise, Skydo, PayZoll, banks and remittance apps — live quotes, published pricing and market estimates, each labelled.",
};

/** The public face of price check: public and published prices, no account needed. */
export default async function PublicPricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  const page = await loadPricePage(await searchParams, null, session?.organization?.entityCountry);

  return (
    <div className="flex flex-col gap-5">
      <FxTicker />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[170px_minmax(0,540px)_minmax(0,1fr)] lg:items-start">
        <PriceToolsNav mode="public" title="Price check" />
        <SwapQuote
          mode="public"
          basePath="/prices"
          currencies={page.currencies}
          initial={page.initial}
          initialResult={page.result}
          initialError={page.error}
          executable={page.executable}
          connected={[]}
        />
        <PriceLabelsCard mode="public" connectedAny={false} />
      </div>
      <ProviderFeatureComparison />
    </div>
  );
}
