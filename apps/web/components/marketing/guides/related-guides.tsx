import { relatedGuides } from "../../../lib/guides/catalog";
import { GuideCard } from "./guide-card";
import styles from "./guides.module.css";

/**
 * Guides about the pair in the calculator, shown under it: look at USD to INR
 * and the top-ten ranking and the India guides appear; switch to INR to USD and
 * the guides about sending from India take their place.
 */
export function RelatedGuides({ from, to }: { from: string; to: string }) {
  const guides = relatedGuides(from, to);
  if (!guides.length) return null;
  return (
    <section className={styles.relatedPrices} aria-labelledby="related-pair-title">
      <h2 id="related-pair-title">Guides for {from} to {to}</h2>
      <p>Rules, costs and how to get more across, written for this route.</p>
      <div className={styles.grid}>{guides.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}</div>
    </section>
  );
}
