import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SiteStats } from "../../../lib/site-stats";
import { ProviderLogo } from "../../app/provider-logo";
import { HeroVideo } from "./hero-video";
import styles from "./hero.module.css";

const BADGE_LOGOS = [
  ["wise", "Wise"],
  ["remitly", "Remitly"],
  ["revolut", "Revolut"],
  ["western-union", "Western Union"],
] as const;

/**
 * Full-bleed cinema hero with the live translucent glass QuickQuote calculator
 * floating beside the headline so the background film visibly glows through it.
 * On desktop the sticky 320px runway clips smoothly into a rounded cinema card;
 * on mobile it stacks cleanly with the calculator immediately playable above the fold.
 */
export function HomeHero({
  providerCount,
  stats,
  calculator,
}: {
  providerCount: number;
  stats?: SiteStats;
  calculator: ReactNode;
}) {
  const figures = stats
    ? [
        { value: stats.providers, label: "providers" },
        { value: stats.countries, label: "countries" },
        { value: stats.currencies, label: "currencies" },
      ].filter((figure) => figure.value > 0)
    : [];

  return (
    <section className={styles.hero} aria-labelledby="home-title" data-home-hero>
      <div className={styles.stage}>
        <div className={styles.film}>
          <HeroVideo />
          <div className={styles.content}>
            <div className={styles.copy}>
              <Link href="/providers" className={`${styles.badge} press`}>
                <span className={styles.logoStack} aria-hidden="true">
                  {BADGE_LOGOS.map(([slug, name]) => (
                    <ProviderLogo key={slug} slug={slug} name={name} size={20} loading="eager" />
                  ))}
                </span>
                <span>
                  <strong>{providerCount > 0 ? `${providerCount.toLocaleString("en-US")}+ providers` : "Every provider"}</strong>
                  {" · "}free to compare
                </span>
                <ArrowRight size={13} aria-hidden />
              </Link>

              <h1 id="home-title" className={styles.title}>
                <span>Send more home.</span>
                <span>Lose less on the way.</span>
              </h1>

              <p className={styles.lead}>
                Compare exchange rates, fees and what actually arrives across banks, transfer apps and stablecoin rails — all from one place.
              </p>

              <div className={styles.actions}>
                <Link href="/prices" className={`${styles.primary} press`}>
                  Compare prices
                  <ArrowRight size={17} aria-hidden />
                </Link>
                <Link href="/coverage" className={`${styles.secondary} press`}>
                  Explore corridors
                </Link>
              </div>

              {figures.length >= 2 ? (
                <ul className={styles.meta} aria-label="Live Railor coverage">
                  {figures.map((figure) => (
                    <li key={figure.label}>
                      <strong>{figure.value.toLocaleString("en-US")}+</strong> {figure.label}
                    </li>
                  ))}
                  <li>Rechecked every 30s</li>
                </ul>
              ) : (
                <p className={styles.metaLine}>Rechecked every 30 seconds · A source on every price · No sign-up</p>
              )}
            </div>

            <div id="calculator" className={styles.calcStage}>
              {calculator}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
