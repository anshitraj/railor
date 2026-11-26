import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
export function HomeHero({ calculator, providerCount }: { calculator: React.ReactNode; providerCount: number }) {
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
            <span>Move money abroad.</span>
            <span>Keep <em>more of it.</em></span>
          </h1>
          <p className={styles.lead}>Compare exchange rates, fees and what arrives across banks and transfer apps, before you send.</p>
          <div className={styles.actions}>
            <Link href="/prices" className={`${styles.primary} press`}>Compare prices<ArrowRight size={17} aria-hidden /></Link>
            <a href="#how-it-works" className={`${styles.secondary} press`}>See how it works</a>
          </div>
          <p className={styles.proof}>Rechecked every 30 seconds<span aria-hidden>·</span>A source on every price<span aria-hidden>·</span>No sign-up</p>
        </div>
        <div className={styles.calcWrap}>
          <div className={styles.calc} id="calculator">
            <span className={styles.island} aria-hidden />
            {calculator}
          </div>
          <p className={styles.scribble} aria-hidden>
            <svg viewBox="0 0 90 40" width="78" height="34"><path d="M86 28 C 62 34, 34 30, 10 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M10 12 l 12 1 M10 12 l 3 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            go on, it’s a real price check
          </p>
        </div>
      </div>
      <div className={styles.marquee}><ProviderMarquee /></div>
    </section>
  );
}
