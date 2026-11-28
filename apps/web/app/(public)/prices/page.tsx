import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { loadPricePage } from "../../../lib/pricing";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceCheckHeader, PriceHelpLinks, PriceModeTabs } from "../../../components/app/price-panels";
import { StablecoinQuote } from "../../../components/price/stablecoin-quote";
import { stablecoinInitial } from "../../../lib/stablecoin-routes";
import { SwapQuote } from "../../../components/app/swap-quote";
import styles from "../../../components/app/price-check.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Compare prices",
  description: "What actually arrives through Wise, Skydo, PayZoll, banks and remittance apps — live quotes, published pricing and market estimates, each labelled.",
};

export default async function PublicPricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  // Stablecoin exchange quotes use their own access rules.
  if (params.mode === "stablecoin") {
    return (
      <div className={styles.page}>
        <FxTicker />
        <div className={styles.pageIntro}>
          <PriceCheckHeader mode="public" guest={!session} />
          <PriceModeTabs mode="stablecoin" base="/prices" />
        </div>
        <StablecoinQuote initial={stablecoinInitial(params)} locked={!session} />
        <PriceHelpLinks mode="public" guest={!session} />
      </div>
    );
  }
  const [page, entitlement] = await Promise.all([
    loadPricePage(params, null, session?.organization?.entityCountry, session ? "business" : "personal"),
    session?.organization ? getEntitlement(session.organization.id).catch(() => null) : null,
  ]);

  return (
    <div className={styles.page}>
      <FxTicker />
      <div className={styles.pageIntro}>
        <PriceCheckHeader mode="public" guest={!session} />
        <PriceModeTabs mode="bank" base="/prices" />
      </div>
      <SwapQuote
        mode="public"
        guest={!session}
        basePath="/prices"
        currencies={page.currencies}
        initial={page.initial}
        initialResult={page.result}
        initialError={page.error}
        executable={page.executable}
        connected={[]}
        entityCountry={session?.organization?.entityCountry ?? null}
        accountEmail={session?.user.email ?? null}
        alertPlan={entitlement?.plan}
      />
      <PriceHelpLinks mode="public" guest={!session} />
    </div>
  );
}
