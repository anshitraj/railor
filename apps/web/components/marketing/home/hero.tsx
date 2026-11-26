import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SiteStats } from "../../../lib/site-stats";
import { ProviderLogo } from "../../app/provider-logo";
import { HeroVideo } from "./hero-video";
import { ProviderMarquee } from "./provider-marquee";
import styles from "./hero.module.css";

const BADGE_LOGOS = [["wise", "Wise"], ["remitly", "Remitly"], ["revolut", "Revolut"], ["western-union", "Western Union"]] as const;

/**
 * First screen: one line on what Railor does, the calculator that does it, and
 * a moving globe of the routes it prices behind them. As the page scrolls, the
 * background settles into a rounded card and the page carries on beneath it.
 */
export function HomeHero({ calculator, providerCount, stats }: { calculator: React.ReactNode; providerCount: number; stats?: SiteStats }) {
  const figures = stats ? [
    { value: stats.providers, label: "providers tracked" },
    { value: stats.countries, label: "countries" },
    { value: stats.currencies, label: "currencies" },
    { value: stats.pricesLast24h ?? 0, label: "prices in 24h" },
  ].filter((figure) => figure.value > 0) : [];
  return (
    <section className={styles.hero} aria-labelledby="home-title" data-home-hero>
      <HeroVideo />
      <div className={styles.inner}>
        <div className={styles.intro}>
          <Link href="/providers" className={`${styles.badge} press`}>
            <span className={styles.logoStack} aria-hidden="true">
              {BADGE_LOGOS.map(([slug, name]) => <ProviderLogo key={slug} slug={slug} name={name} size={20} loading="eager" />)}
            </span>
            <span><strong>{providerCount > 0 ? `${providerCount.toLocaleString("en-US")}+ providers` : "Every provider"}</strong> · free to compare</span>
            <ArrowRight size={13} aria-hidden />
          </Link>
          <h1 id="home-title" className={styles.title}>
            <span>Send more home.</span>
            <span><em>Lose less</em> on the way.</span>
          </h1>
          <p className={styles.lead}>Compare exchange rates, fees and what arrives across banks and transfer apps, before you send.</p>
          <div className={styles.actions}>
            <Link href="/prices" className={`${styles.primary} press`}>Compare prices<ArrowRight size={17} aria-hidden /></Link>
            <a href="#how-it-works" className={`${styles.secondary} press`}>See how it works</a>
          </div>
          <p className={styles.proof}>Rechecked every 30 seconds<span aria-hidden>·</span>A source on every price<span aria-hidden>·</span>No sign-up</p>
          {figures.length >= 3 ? (
            <ul className={styles.figures} aria-label="What Railor covers today, counted from its own records">
              {figures.map((figure) => <li key={figure.label}><strong>{figure.value.toLocaleString("en-US")}</strong>{figure.label}</li>)}
            </ul>
          ) : null}
        </div>
        <div className={styles.calcWrap}>
          <div className={styles.calc} id="calculator">
            <span className={styles.island} aria-hidden />
            {calculator}
          </div>
        </div>
      </div>
      <div className={styles.marquee}><ProviderMarquee /></div>
    </section>
  );
}
