import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { PLAN_LIMITS, PLAN_PRICES, planName } from "../../../lib/plans";
import { listSavedPairsWithAlerts } from "../../../lib/rate-alerts";
import { SavedPairsList } from "../../../components/app/saved-pairs-list";
import styles from "../../../components/app/saved.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved" };

/** Everything saved from Transfer, one tap from a fresh comparison. */
export default async function SavedPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const [pairs, entitlement] = await Promise.all([
    listSavedPairsWithAlerts(session.organization.id, session.user.id).catch(() => []),
    getEntitlement(session.organization.id),
  ]);
  const { savedPairs, rateAlerts } = entitlement.limits;
  const alerts = pairs.filter((pair) => pair.alert).length;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Saved</h1>
        <p>Open a saved pair or provider corridor to check its current price, or set an alert to get an email when it gets better.</p>
        <p className={styles.usage}>
          {planName(entitlement.plan)} plan · {pairs.length} of {savedPairs} saved · {alerts} of {rateAlerts} {rateAlerts === 1 ? "alert" : "alerts"}
          {entitlement.plan === "free" ? <> · <Link href="/app/upgrade">Get {PLAN_LIMITS.plus.rateAlerts} alerts for ${PLAN_PRICES.plus.monthlyUsd} a month</Link></> : null}
        </p>
      </header>
      <SavedPairsList initial={pairs} />
    </div>
  );
}
