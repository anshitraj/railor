import { GUIDES } from "../../../lib/guides/catalog";
import home from "../home/home.module.css";
import { GuideCard } from "./guide-card";
import styles from "./guides.module.css";

/**
 * The home page's guides: people search "how to send money abroad" before they
 * search for a provider, so the answers sit next to the calculator, and each
 * one ends in a live comparison. The country list and the full guide index live
 * in the Guides menu and on /guides, not here.
 */
export function GuidesSection() {
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
          {GUIDES.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}
        </div>
      </div>
    </section>
  );
}
