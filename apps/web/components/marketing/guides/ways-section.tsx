import { loadPricePage } from "../../../lib/pricing";
import { convertHref } from "../../../lib/guides/destinations";
import { waysToSend } from "../../../lib/ways-to-send";
import { WaysToSend } from "../../price/ways-to-send";
import styles from "./guides.module.css";

/**
 * A guide's corridor, by how the money moves: built from the same price check
 * as the comparison (personal sender, 1,000 of the sending currency), with
 * each provider linking to its price in the full comparison.
 */
const SENDER_COUNTRY: Record<string, string> = { USD: "US", GBP: "GB", EUR: "DE", CAD: "CA", AUD: "AU", AED: "AE", SGD: "SG" };

export async function WaysToSendSection({ route, signedIn }: { route: { from: string; to: string; country: string; label: string }; signedIn: boolean }) {
  const page = await loadPricePage(
    { from: route.from, to: route.to, amount: "1000", destinationCountry: route.country, direction: "send", ...(SENDER_COUNTRY[route.from] ? { country: SENDER_COUNTRY[route.from] } : {}), profile: "personal", purpose: "personal", market: "1" },
    null, null, "personal",
  );
  const groups = waysToSend({ rows: page.result?.rows ?? [], candidates: page.result?.marketCoverage?.allProviders ?? page.result?.marketCoverage?.providers ?? [], from: route.from, to: route.to, receiving: false });
  if (!groups.length) return null;
  const compare = convertHref({ code: route.country, currency: route.to }, { signedIn, from: route.from });
  return (
    <div className={styles.ways} id="ways-to-send">
      <WaysToSend groups={groups} from={route.from} to={route.to} title={`Ways to send ${route.label}`} compareHref={compare} />
    </div>
  );
}

export function WaysToSendSkeleton() {
  return <div className={styles.ways} aria-busy="true" aria-label="Loading ways to send"><div className={styles.skeleton} style={{ height: 320 }} /></div>;
}
