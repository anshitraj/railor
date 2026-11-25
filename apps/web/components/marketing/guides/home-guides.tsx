import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GUIDES, guideHref } from "../../../lib/guides/catalog";
import type { Destination } from "../../../lib/guides/destinations";
import home from "../home/home.module.css";
import { CountryLinks } from "./country-links";
import { GuideCard } from "./guide-card";
import styles from "./guides.module.css";

/**
 * The home page's guides: people search "how to send money abroad" before they
 * search for a provider, so the answers sit next to the calculator, and each
 * one ends in a live comparison.
 */
export function GuidesSection({ destinations, signedIn }: { destinations: readonly Destination[]; signedIn: boolean }) {
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

        <div className={styles.grid}>
          {GUIDES.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}
        </div>

        <div className={styles.homeFoot}>
          {destinations.length ? (
            <div>
              <h3>Send money to</h3>
              <CountryLinks destinations={destinations.slice(0, 12)} signedIn={signedIn} />
              <Link href="/guides/countries" className={styles.moreLink}>View all countries<ArrowRight size={16} aria-hidden /></Link>
            </div>
          ) : null}
          <div>
            <h3>New to sending money abroad?</h3>
            <p style={{ maxWidth: "46ch", marginBottom: 12, color: "var(--color-muted)", fontSize: 16, lineHeight: 1.55 }}>Start with the basics, then compare what arrives before you pay.</p>
            <div className={styles.homeLinks}>
              <Link href={guideHref("how-to-send-money-abroad")} className={home.textLink}>How to send money abroad<ArrowRight size={16} aria-hidden /></Link>
              <Link href="/guides" className={home.textLink}>All guides<ArrowRight size={16} aria-hidden /></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
