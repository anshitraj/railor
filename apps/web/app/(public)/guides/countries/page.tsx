import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "../../../../components/marketing/page-header";
import { CountryLinks } from "../../../../components/marketing/guides/country-links";
import styles from "../../../../components/marketing/guides/guides.module.css";
import { getSession } from "../../../../lib/auth";
import { loadGuideDestinations } from "../../../../lib/guides/load";

export const metadata = {
  title: "Send money abroad: every country Railor compares",
  description: "Choose where the money is going and Railor opens the comparison with the country and its currency already selected.",
};

export default async function CountriesPage() {
  const [session, destinations] = await Promise.all([getSession(), loadGuideDestinations()]);

  return (
    <div className={styles.hub}>
      <PageHeader eyebrow="Guides" title="Send money to any country Railor compares">
        <p>Choose where the money is going. Railor opens the comparison with the country and its currency already selected, so you only add the amount.</p>
      </PageHeader>
      <section className={styles.block} aria-labelledby="all-title">
        <h2 id="all-title">{destinations.all.length ? `${destinations.all.length} countries` : "Countries"}</h2>
        {destinations.all.length ? (
          <CountryLinks destinations={destinations.all} signedIn={Boolean(session)} />
        ) : (
          <p>The country list isn’t available right now. Open the comparison and pick a country there.</p>
        )}
        <Link href="/guides" className={styles.moreLink}>Back to guides<ArrowRight size={16} aria-hidden /></Link>
      </section>
    </div>
  );
}
