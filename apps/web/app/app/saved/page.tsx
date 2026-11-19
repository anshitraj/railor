import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { listSavedPairs, SAVED_PAIR_LIMIT } from "../../../lib/saved-pairs";
import { SavedPairsList } from "../../../components/app/saved-pairs-list";
import styles from "../../../components/app/saved.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved" };

/** Everything saved from Transfer, one tap from a fresh comparison. */
export default async function SavedPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const pairs = await listSavedPairs(session.organization.id).catch(() => []);
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Saved</h1>
        <p>Pairs you saved from Transfer. Open one to see today’s prices. Up to {SAVED_PAIR_LIMIT}.</p>
      </header>
      <SavedPairsList initial={pairs} />
    </div>
  );
}
