import { Banknote, Globe2, Route, ScanSearch, Waypoints } from "lucide-react";
import type { SiteStats } from "../../../lib/site-stats";
import { CountUp } from "./count-up";
import styles from "./home.module.css";

/** Railor in numbers: what the product covers, counted from its own data. A number that can't be counted is not shown. */
export function NumbersSection({ stats }: { stats: SiteStats }) {
  const items = [
    { icon: Waypoints, value: stats.providers, label: "Providers tracked", note: "Banks, transfer apps and payment platforms" },
    { icon: Globe2, value: stats.countries, label: "Countries covered", note: "Destinations with at least one provider on file" },
    { icon: Banknote, value: stats.currencies, label: "Currencies", note: "Payout currencies across those routes" },
    { icon: Route, value: stats.routes, label: "Country routes mapped", note: "Sender-to-destination pairs we can compare" },
    ...(stats.pricesLast24h ? [{ icon: ScanSearch, value: stats.pricesLast24h, label: "Prices recorded in 24 hours", note: "Quotes Railor collected and stored, each with its source" }] : []),
  ].filter((item) => item.value > 0);
  if (items.length < 3) return null;
  return (
    <section className={styles.section} aria-labelledby="numbers-title">
      <div className={styles.container}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Railor in numbers</p>
            <h2 id="numbers-title" className={styles.title}>What Railor covers today.</h2>
          </div>
          <p className={styles.lead}>Counted from Railor’s own provider and price records, not estimated.</p>
        </div>
        <ul className={styles.numbers}>
          {items.map(({ icon: Icon, value, label, note }) => (
            <li key={label} className={styles.number} data-home-reveal>
              <Icon size={20} aria-hidden />
              <strong><CountUp value={value} /></strong>
              <span>{label}</span>
              <small>{note}</small>
            </li>
          ))}
        </ul>
        <p className={styles.numbersNote}>Not every provider is quoted on every route. Each price shows where it comes from and when it was collected. Counts refresh about every ten minutes.</p>
      </div>
    </section>
  );
}
