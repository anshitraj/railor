import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { loadPricePage, productionConnectedSlugs } from "../../../lib/pricing";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceLabelsCard, PriceToolsNav } from "../../../components/app/price-panels";
import { SwapQuote } from "../../../components/app/swap-quote";
import { ProviderFeatureComparison } from "../../../components/app/provider-feature-comparison";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price check" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const [page, connected] = await Promise.all([loadPricePage(await searchParams, org.id, org.entityCountry), productionConnectedSlugs(org.id)]);

  return (
    <div className="product-page space-y-5">
      <FxTicker />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[170px_minmax(0,540px)_minmax(0,1fr)] lg:items-start">
        <PriceToolsNav mode="app" title="Price check" />
        <SwapQuote
          mode="app"
          basePath="/app/prices"
          currencies={page.currencies}
          initial={page.initial}
          initialResult={page.result}
          initialError={page.error}
          executable={page.executable}
          connected={connected}
        />
        <PriceLabelsCard mode="app" connectedAny={connected.some((s) => s === "wise" || s === "airwallex")} />
      </div>
      <ProviderFeatureComparison />
    </div>
  );
}
