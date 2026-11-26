import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GUIDES, guideBySlug, type GuideMeta } from "../../../lib/guides/catalog";
import home from "../home/home.module.css";
import { GuideCard } from "./guide-card";
import styles from "./guides.module.css";

/**
 * The home page's guides: people search "how to send money abroad" before they
 * search for a provider, so the answers sit next to the calculator, and each
 * one ends in a live comparison. Only six sit here; the full index and the country
 * list live in the Guides menu and on /guides.
 */
const HOME_GUIDES = [
  "how-to-send-money-abroad",
  "real-cost-of-sending-money",
  "best-money-transfer-services",
  "usd-to-inr",
  "send-money-to-india",
  "send-money-from-india-to-usa",
];

export function GuidesSection() {
  const guides = HOME_GUIDES.map(guideBySlug).filter((guide): guide is GuideMeta => Boolean(guide));
  return (
    <section className={home.section} aria-labelledby="guides-title">
      <div className={home.container}>
        <div className={home.head}>
          <div>
            <p className={home.eyebrow}>Guides</p>
            <h2 id="guides-title" className={home.title}>Know what it costs before you send.</h2>
          </div>
          <p className={home.lead}>Plain answers to what people search before they send money abroad. Every guide ends in a live comparison.</p>
        </div>

        <div className={`${styles.grid} ${styles.homeGrid}`} data-rail>
          {guides.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}
        </div>
        <Link href="/guides" className={styles.moreLink}>All {GUIDES.length} guides<ArrowRight size={16} aria-hidden /></Link>
      </div>
    </section>
  );
}
