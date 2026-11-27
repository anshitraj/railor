import styles from "./collage.module.css";

/** Illustrated tiles drawn by lib/media/generate-collage.py in the landing page's own palette. */
const PHOTOS = [
  { src: "/images/collage/tile-arrived.jpg", depth: 1 },
  { src: "/images/collage/tile-compare.jpg", depth: 3 },
  { src: "/images/collage/tile-coins.jpg", depth: 2 },
  { src: "/images/collage/tile-rate.jpg", depth: 1 },
  { src: "/images/collage/tile-route.jpg", depth: 3 },
  { src: "/images/collage/tile-paid.jpg", depth: 2 },
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
            // eslint-disable-next-line @next/next/no-img-element -- illustrated tiles drawn for Railor
            <img key={index} className={styles.photo} data-depth={photo.depth} data-copy={index >= PHOTOS.length || undefined} src={photo.src} alt="" width={480} height={600} loading="lazy" decoding="async" />
          ))}
        </div>
      </div>
    </section>
  );
}
