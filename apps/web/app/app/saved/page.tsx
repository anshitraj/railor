import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { SAVED_PAIR_LIMIT } from "../../../lib/saved-pairs";
import { listSavedPairsWithAlerts } from "../../../lib/rate-alerts";
import { SavedPairsList } from "../../../components/app/saved-pairs-list";
import styles from "../../../components/app/saved.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved" };

/** Everything saved from Transfer, one tap from a fresh comparison. */
export default async function SavedPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const pairs = await listSavedPairsWithAlerts(session.organization.id, session.user.id).catch(() => []);
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Saved</h1>
        <p>Open a saved pair or provider corridor to check its current price, or set an alert to get an email when it gets better. Up to {SAVED_PAIR_LIMIT} saved transfers.</p>
      </header>
      <SavedPairsList initial={pairs} />
    </div>
  );
}
