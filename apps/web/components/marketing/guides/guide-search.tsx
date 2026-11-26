import { Search } from "lucide-react";
import { defaultCompareAmount } from "../../../lib/guides/comparison";
import styles from "./guides.module.css";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "CAD", "AUD", "AED", "SGD"] as const;

/**
 * "Search now and save on your transfer": a plain form (it works without
 * JavaScript) that opens the price check with the guide's route filled in.
 */
export function GuideSearch({ route, signedIn }: { route: { from: string; to: string }; signedIn: boolean }) {
  return (
    <form className={styles.search} action={signedIn ? "/app/prices" : "/prices"} method="get" aria-label="Search live prices">
      <div className={styles.searchHead}>
        <strong>Search now and save on your transfer</strong>
        <span>Instantly view live exchange rates, fees and delivery times.</span>
      </div>
      <div className={styles.searchFields}>
        <label>From<select name="from" defaultValue={route.from}>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <label>To<select name="to" defaultValue={route.to}>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <label>Amount<input name="amount" type="number" inputMode="decimal" min="1" step="any" defaultValue={defaultCompareAmount(route.from)} /></label>
        <button type="submit" className="press"><Search size={16} aria-hidden />Check live prices</button>
      </div>
      {signedIn ? null : <><input type="hidden" name="market" value="1" /><input type="hidden" name="profile" value="personal" /><input type="hidden" name="direction" value="send" /><input type="hidden" name="purpose" value="personal" /></>}
    </form>
  );
}
