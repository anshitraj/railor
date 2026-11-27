import { ArrowRight, Globe2, Send } from "lucide-react";
import styles from "./collage.module.css";

interface CollagePhoto {
  src: string;
  alt: string;
  /** Desktop horizontal left offset (%) across the 1360x410 artboard */
  left: string;
  /** Desktop vertical top offset (%) */
  top: string;
  /** Desktop relative width (%) */
  width: string;
  /** Layer stacking order (1..9), jumps to 25 on hover */
  z: number;
  /** Vertical scroll parallax amplitude in px (alternating +/- directions) */
  speed: number;
}

/**
 * 9 authentic, Portra-400 color-harmonized editorial photographs (3 bespoke 35mm
 * shots + 6 curated Pexels lifestyle photos — see public/images/collage/SOURCES.md).
 * Arranged in GetOn's signature overlapping staggered scatter across a borderless canvas.
 */
const PHOTOS: CollagePhoto[] = [
  { src: "/images/collage/life-01.jpg", alt: "Freelancer working on a laptop by a sunlit café window", left: "0%", top: "4%", width: "14.8%", z: 1, speed: 34 },
  { src: "/images/collage/life-02.jpg", alt: "Expat checking a transfer on his phone in a warm kitchen", left: "10.6%", top: "24%", width: "13.8%", z: 2, speed: -38 },
  { src: "/images/collage/life-03.jpg", alt: "Couple smiling together while checking a money transfer", left: "19.8%", top: "36%", width: "14.4%", z: 3, speed: 46 },
  { src: "/images/collage/life-04.jpg", alt: "Students abroad checking rates on a phone and laptop", left: "30.2%", top: "18%", width: "14.0%", z: 4, speed: -28 },
  { src: "/images/collage/life-05.jpg", alt: "Traveler walking through a sunlit terminal with carry-on luggage", left: "41.8%", top: "10%", width: "14.2%", z: 5, speed: 42 },
  { src: "/images/collage/life-06.jpg", alt: "Tapping a card on a contactless reader at a sunlit café", left: "53.2%", top: "0%", width: "14.6%", z: 6, speed: -44 },
  { src: "/images/collage/life-07.jpg", alt: "Freelancer smiling on a phone call at a wooden desk", left: "64.4%", top: "10%", width: "14.2%", z: 7, speed: 34 },
  { src: "/images/collage/life-08.jpg", alt: "Family smiling together over a laptop at home", left: "75.0%", top: "16%", width: "14.0%", z: 8, speed: -36 },
  { src: "/images/collage/life-09.jpg", alt: "Traveler looking at a smartphone by an airport window", left: "84.8%", top: "25%", width: "15.2%", z: 9, speed: 40 },
];

/**
 * GetOn's "Built for lives that cross borders.":
 * Split display headline with tactile inline icons above and below a borderless,
 * overlapping 9-photo editorial scatter that shifts vertically in opposing directions
 * on scroll and scales cleanly on hover.
 */
export function CollageSection() {
  return (
    <section className={styles.section} aria-labelledby="collage-title">
      <div className={styles.container}>
        <h2 id="collage-title" className={styles.title}>
          <span className={styles.top}>
            Built for
            <span className={styles.badgePlane} aria-hidden="true">
              <Send size={28} strokeWidth={2.2} />
            </span>
            lives
          </span>

          {/* Desktop: borderless 9-photo overlapping scatter with opposing JS scroll parallax */}
          <div className={styles.stage} data-collage-stage aria-hidden="true">
            {PHOTOS.map((photo) => (
              <div
                key={photo.src}
                className={styles.tile}
                data-collage-speed={photo.speed}
                style={{
                  left: photo.left,
                  top: photo.top,
                  width: photo.width,
                  zIndex: photo.z,
                }}
              >
                <div className={styles.inner}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 640x760 editorial JPEGs */}
                  <img src={photo.src} alt={photo.alt} width={640} height={760} loading="lazy" decoding="async" />
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: continuous drifting photo ribbon */}
          <div className={styles.mobileStrip} aria-hidden="true">
            <div className={styles.mobileTrack}>
              {[...PHOTOS, ...PHOTOS].map((photo, index) => (
                <div key={`${photo.src}-${index}`} className={styles.mobileCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 640x760 editorial JPEGs */}
                  <img src={photo.src} alt="" width={640} height={760} loading="lazy" decoding="async" />
                </div>
              ))}
            </div>
          </div>

          <span className={styles.bottom}>
            that cross
            <span className={styles.badgeCard} aria-hidden="true">
              <Globe2 size={24} strokeWidth={2.1} />
            </span>
            borders.
          </span>
        </h2>

        <div className={styles.foot} data-home-reveal>
          <p>
            Freelancers, expats, family providers, students abroad, digital nomads and finance teams. Railor fits how you move money.
          </p>
          <div className={styles.actions}>
            <a href="#transfers" className={`${styles.primary} press`}>
              Compare prices
              <ArrowRight size={16} aria-hidden />
            </a>
            <a href="#how-it-works" className={`${styles.secondary} press`}>
              See how it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
