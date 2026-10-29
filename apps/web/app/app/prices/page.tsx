import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { loadPricePage, productionConnectedSlugs } from "../../../lib/pricing";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceCheckHeader, PriceLabelsCard } from "../../../components/app/price-panels";
import { SwapQuote } from "../../../components/app/swap-quote";
import { ProviderFeatureComparison } from "../../../components/app/provider-feature-comparison";
import { PriceDisclosure } from "../../../components/app/price-disclosure";
import styles from "../../../components/app/price-check.module.css";
import { onboardingPriceProfile } from "../../../lib/onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price check" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const [page, connected] = await Promise.all([loadPricePage(await searchParams, org.id, org.entityCountry, onboardingPriceProfile(org.building)), productionConnectedSlugs(org.id)]);

  return (
    <div className={styles.page}>
      <FxTicker />
      <PriceCheckHeader mode="app" />
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
      <PriceDisclosure title="How prices and sources work" description="Account quotes, published schedules, public references and evidence labels."><PriceLabelsCard mode="app" connectedAny={connected.some((s) => s === "wise" || s === "airwallex")} /></PriceDisclosure>
      <PriceDisclosure title="Compare provider features" description="Explore coverage, capabilities and account requirements."><ProviderFeatureComparison /></PriceDisclosure>
    </div>
  );
}
