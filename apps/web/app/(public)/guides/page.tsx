import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "../../../components/marketing/page-header";
import { CountryLinks } from "../../../components/marketing/guides/country-links";
import { GuideCard } from "../../../components/marketing/guides/guide-card";
import styles from "../../../components/marketing/guides/guides.module.css";
import { getSession } from "../../../lib/auth";
import { GUIDE_TOPICS, guidesInTopic } from "../../../lib/guides/catalog";
import { loadGuideDestinations } from "../../../lib/guides/load";

export const metadata = {
  title: "Guides: how to send money abroad",
  description: "Plain-language guides to sending money abroad, what it really costs and which bank details you need, each ending in a live price comparison.",
};

export default async function GuidesPage() {
  const [session, destinations] = await Promise.all([getSession(), loadGuideDestinations()]);
  const signedIn = Boolean(session);

  return (
    <div className={styles.hub}>
      <PageHeader eyebrow="Guides" title="How to send money abroad, and what it really costs">
        <p>Short, plain answers to what people search before they send money. Every guide ends in a live comparison, so you can act on it in a tap.</p>
      </PageHeader>

      {destinations.popular.length ? (
        <section className={styles.block} aria-labelledby="countries-title">
          <h2 id="countries-title">Send money to</h2>
          <p>Pick a country and Railor opens the comparison with it already chosen.</p>
          <CountryLinks destinations={destinations.popular} signedIn={signedIn} />
          <Link href="/guides/countries" className={styles.moreLink}>View all countries<ArrowRight size={16} aria-hidden /></Link>
        </section>
      ) : null}

      {GUIDE_TOPICS.map((topic) => (
        <section key={topic.id} className={styles.block} aria-labelledby={`${topic.id}-title`}>
          <h2 id={`${topic.id}-title`}>{topic.label}</h2>
          <p>{topic.blurb}</p>
          <div className={styles.grid}>{guidesInTopic(topic.id).map((guide) => <GuideCard key={guide.slug} guide={guide} />)}</div>
        </section>
      ))}
    </div>
  );
}
