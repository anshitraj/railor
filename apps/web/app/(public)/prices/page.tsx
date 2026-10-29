import { getSession } from "../../../lib/auth";
import { loadPricePage } from "../../../lib/pricing";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceCheckHeader, PriceLabelsCard } from "../../../components/app/price-panels";
import { SwapQuote } from "../../../components/app/swap-quote";
import { ProviderFeatureComparison } from "../../../components/app/provider-feature-comparison";
import { PriceDisclosure } from "../../../components/app/price-disclosure";
import styles from "../../../components/app/price-check.module.css";

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
    <div className={styles.page}>
      <FxTicker />
      <PriceCheckHeader mode="public" />
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
      <PriceDisclosure title="How prices and sources work" description="Account quotes, published schedules, public references and evidence labels."><PriceLabelsCard mode="public" connectedAny={false} /></PriceDisclosure>
      <PriceDisclosure title="Compare provider features" description="Explore coverage, capabilities and account requirements."><ProviderFeatureComparison /></PriceDisclosure>
    </div>
  );
}
