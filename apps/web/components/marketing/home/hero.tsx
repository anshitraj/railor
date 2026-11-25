import Link from "next/link";
import { ArrowRight, Play, RefreshCw, ShieldCheck, Waypoints } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import { SealSticker, StampSticker } from "../die-cut-stickers";

const BADGE_LOGOS = [["wise", "Wise"], ["remitly", "Remitly"], ["revolut", "Revolut"], ["western-union", "Western Union"]] as const;
import { HeroGlobe } from "./hero-globe";
import { ProviderMarquee } from "./provider-marquee";
import styles from "./home.module.css";

/** First screen: what Railor does in one line, and the calculator that does it, over a globe of the routes it prices. */
export function HomeHero({ calculator, providerCount }: { calculator: React.ReactNode; providerCount: number }) {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroGlow} aria-hidden />
      <div className={styles.container}>
        <div className={styles.heroInner}>
          <HeroGlobe />
          <div className={styles.heroIntro}>
            {/* Proof, not a slogan: the real providers it compares, and how many. */}
            <Link href="/providers" className={`${styles.heroBadge} press`}>
              <span className={styles.logoStack} aria-hidden="true">
                {BADGE_LOGOS.map(([slug, name]) => <ProviderLogo key={slug} slug={slug} name={name} size={20} loading="eager" />)}
              </span>
              <span><strong>{providerCount > 0 ? `${providerCount.toLocaleString("en-US")}+ providers` : "Every provider"}</strong> · free to compare</span>
              <ArrowRight size={13} aria-hidden />
            </Link>
            <h1 id="home-title" className={styles.heroTitle}>
              <span>Move money abroad.</span>
              <span>Keep <span className={styles.heroAccent}>more of it.</span></span>
            </h1>
            <p className={styles.heroLead}>
              Compare exchange rates, fees and what arrives across banks and transfer apps before you send.
            </p>
          </div>
          <div className={styles.heroExtras}>
            <div className={styles.heroActions}>
              <Link href="/prices" className={`${styles.heroCta} press`}>Compare prices<ArrowRight size={17} aria-hidden /></Link>
              <a href="#how-it-works" className={`${styles.heroGhost} press`}><span className={styles.heroPlay}><Play size={11} aria-hidden /></span>See how it works</a>
            </div>
            <ul className={styles.heroFeatures}>
              <li><RefreshCw size={18} aria-hidden />Rechecked every 30s</li>
              <li><Waypoints size={18} aria-hidden />{providerCount > 0 ? `${providerCount.toLocaleString("en-US")} providers tracked` : "Banks and transfer apps"}</li>
              <li><ShieldCheck size={18} aria-hidden />Source on every price</li>
            </ul>
          </div>
          <div className={styles.heroCalc} id="calculator">
            {/* On phones the calculator sits in a device that rises into place; on larger screens this wrapper is invisible. */}
            <div className={styles.phone}>
              <span className={styles.phoneIsland} aria-hidden="true" />
              {calculator}
            </div>
            <div className={styles.phoneStickers} aria-hidden="true">
              <SealSticker word="FREE" line="to compare" size={78} tilt={-12} delay={1.05} />
              <StampSticker text="No sign-up" size={76} tilt={10} delay={1.2} />
              <span className={`sticker ${styles.logoSticker}`} style={{ "--tilt": "-4deg", "--delay": "1.35s" } as React.CSSProperties}>
                <span className={styles.logoStack}>
                  {BADGE_LOGOS.map(([slug, name]) => <ProviderLogo key={slug} slug={slug} name={name} size={22} />)}
                </span>
                {providerCount > 0 ? `${providerCount.toLocaleString("en-US")}+ providers` : "Every provider"}
              </span>
            </div>
          </div>
        </div>

        <ProviderMarquee />
      </div>
    </section>
  );
}
