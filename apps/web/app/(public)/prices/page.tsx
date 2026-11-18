import { Bell, CheckCircle2, FileText, Link2, ShieldCheck, Timer } from "lucide-react";
import { getSession } from "../../../lib/auth";
import { loadPricePage } from "../../../lib/pricing";
import { lockPriceCheck } from "../../../lib/price-lock";
import { FxTicker } from "../../../components/app/fx-ticker";
import { PriceCheckHeader, PriceHelpLinks, PriceModeTabs } from "../../../components/app/price-panels";
import { StablecoinQuote } from "../../../components/price/stablecoin-quote";
import { stablecoinInitial } from "../../../lib/stablecoin-routes";
import { SwapQuote } from "../../../components/app/swap-quote";
import { QuickQuote } from "../../../components/price/quick-quote";
import styles from "../../../components/app/price-check.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Compare prices",
  description: "What actually arrives through Wise, Skydo, PayZoll, banks and remittance apps — live quotes, published pricing and market estimates, each labelled.",
};

const UNLOCKS = [
  { Icon: CheckCircle2, title: "Exactly what arrives", body: "Every provider your profile can use, ranked by what reaches the bank." },
  { Icon: Timer, title: "Fees and delivery time", body: "Known fees, the rate and when the money lands." },
  { Icon: Link2, title: "Where each price comes from", body: "The source, when it was checked and what’s still unknown." },
  { Icon: FileText, title: "Invoice upload", body: "Drop in an invoice and compare ways to get paid for it." },
  { Icon: Bell, title: "Alerts", body: "Hear when a fee or a route you use changes." },
];

/**
 * Price check. Signed in (free): the full live comparison. Signed out: the
 * calculator works and shows which providers were checked, but every price
 * stays on the server until the visitor signs in.
 */
export default async function PublicPricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  // Exchange prices on the stablecoin view follow the same rule: routes and networks are public, amounts need sign-in.
  if (params.mode === "stablecoin") {
    return (
      <div className={styles.page}>
        <FxTicker />
        <PriceCheckHeader mode="public" />
        <PriceModeTabs mode="stablecoin" base="/prices" />
        <StablecoinQuote initial={stablecoinInitial(params)} locked={!session} />
        <PriceHelpLinks />
      </div>
    );
  }
  const page = await loadPricePage(params, null, session?.organization?.entityCountry);

  if (!session) {
    return (
      <div className={styles.page}>
        <FxTicker />
        <PriceCheckHeader mode="public" />
        <PriceModeTabs mode="bank" base="/prices" />
        <div className={styles.lockedLayout}>
          <QuickQuote
            variant="app"
            compareBase="/prices"
            locked
            currencies={page.currencies}
            initial={{ from: page.initial.from, to: page.initial.to, amount: page.initial.amount, context: page.initial.context }}
            initialResult={page.result ? lockPriceCheck(page.result) : null}
            initialError={page.error}
          />
          <aside className={styles.unlockCard} aria-labelledby="unlock-title">
            <span className={styles.unlockIcon}><ShieldCheck size={18} aria-hidden /></span>
            <h2 id="unlock-title">Sign in to see every price</h2>
            <p>A free Railor account shows the full comparison for this exact amount and route.</p>
            <ul>
              {UNLOCKS.map(({ Icon, title, body }) => (
                <li key={title}><Icon size={17} aria-hidden /><span><strong>{title}</strong>{body}</span></li>
              ))}
            </ul>
          </aside>
        </div>
        <PriceHelpLinks />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <FxTicker />
      <PriceCheckHeader mode="public" />
      <PriceModeTabs mode="bank" base="/prices" />
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
      <PriceHelpLinks />
    </div>
  );
}
