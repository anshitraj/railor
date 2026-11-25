import Link from "next/link";
import { Flag } from "@railor/ui";
import { convertHref, type Destination } from "../../../lib/guides/destinations";
import styles from "./guides.module.css";

/** One link per country; each opens Convert currencies with that country and its currency already chosen. */
export function CountryLinks({ destinations, signedIn }: { destinations: readonly Destination[]; signedIn: boolean }) {
  return (
    <ul className={styles.countries}>
      {destinations.map((destination) => (
        <li key={destination.code}>
          <Link href={convertHref(destination, { signedIn })} className={styles.country}>
            <Flag code={destination.code} size={18} />
            <span>Send money to {destination.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
