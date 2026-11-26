import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { loadPricePage, productionConnectedSlugs } from "../../../lib/pricing";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceCheckHeader, PriceHelpLinks, PriceModeTabs } from "../../../components/app/price-panels";
import { listSavedPairsWithAlerts } from "../../../lib/rate-alerts";
import { StablecoinQuote } from "../../../components/price/stablecoin-quote";
import { stablecoinInitial } from "../../../lib/stablecoin-routes";
import { SwapQuote } from "../../../components/app/swap-quote";
import styles from "../../../components/app/price-check.module.css";
import { onboardingPriceProfile } from "../../../lib/onboarding";
import { savedProviderSlug } from "../../../lib/saved-transfer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price check" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const params = await searchParams;
  if (params.mode === "stablecoin") {
    return (
      <div className={styles.page}>
        <FxTicker />
        <PriceCheckHeader mode="app" />
        <PriceModeTabs mode="stablecoin" base="/app/prices" />
        <StablecoinQuote initial={stablecoinInitial(params)} />
        <PriceHelpLinks />
      </div>
    );
  }
  const [page, connected, savedPairs, entitlement] = await Promise.all([loadPricePage(params, org.id, org.entityCountry, onboardingPriceProfile(org.building)), productionConnectedSlugs(org.id), listSavedPairsWithAlerts(org.id, session.user.id).catch(() => []), getEntitlement(org.id).catch(() => null)]);
  const initialProvider = savedProviderSlug(params.provider);

  return (
    <div className={styles.page}>
      <FxTicker />
      <PriceCheckHeader mode="app" />
      <PriceModeTabs mode="bank" base="/app/prices" />
        <SwapQuote
          key={JSON.stringify([page.initial, initialProvider])}
          mode="app"
          basePath="/app/prices"
          currencies={page.currencies}
          initial={page.initial}
          initialResult={page.result}
          initialError={page.error}
          executable={page.executable}
          savedPairs={savedPairs}
          accountEmail={session.user.email}
          alertPlan={entitlement?.plan}
          initialProvider={initialProvider}
          connected={connected}
          entityCountry={org.entityCountry ?? null}
        />
      <PriceHelpLinks />
    </div>
  );
}
