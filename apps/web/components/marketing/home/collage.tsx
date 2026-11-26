import Link from "next/link";
import styles from "./collage.module.css";

const PHOTOS = [
  { src: "/images/collage/freelancer.jpg", depth: 1 },
  { src: "/images/collage/airport-call.jpg", depth: 3 },
  { src: "/images/collage/couple-phone.jpg", depth: 2 },
  { src: "/images/collage/boarding-pass.jpg", depth: 1 },
  { src: "/images/collage/team.jpg", depth: 3 },
  { src: "/images/collage/window-phone.jpg", depth: 2 },
];

/**
 * GetOn's "Built for lives that cross borders": the headline wraps around a row
 * of photographs that drift at different speeds as the page scrolls. On phones
 * the photos roll by on their own.
 */
export function CollageSection() {
  return (
    <section className={styles.section} aria-labelledby="collage-title">
      <h2 id="collage-title" className={styles.title}>
        <span className={styles.top}>Built for <span className={`coin ${styles.coin}`} data-metal="gold" aria-hidden>$</span> lives</span>
        <span className={styles.bottom}>that cross <span className={`coin ${styles.coin}`} data-metal="silver" aria-hidden>₹</span> borders.</span>
      </h2>
      <div className={styles.strip} aria-hidden>
        <div className={styles.track}>
          {[...PHOTOS, ...PHOTOS].map((photo, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- stock photos (Pexels licence, see public/images/collage/SOURCES.md)
            <img key={index} className={styles.photo} data-depth={photo.depth} data-copy={index >= PHOTOS.length || undefined} src={photo.src} alt="" width={480} height={600} loading="lazy" decoding="async" />
          ))}
        </div>
      </div>
      <div className={styles.foot}>
        <p>Families sending home, freelancers paid from abroad, students, travellers and companies paying across borders. Railor shows each of them what arrives before they send.</p>
        <div className={styles.actions}>
          <Link href="/#calculator" className={`${styles.primary} press`}>Compare a transfer</Link>
          <Link href="/guides" className={`${styles.secondary} press`}>Read the guides</Link>
        </div>
      </div>
    </section>
  );
}
