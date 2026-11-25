import Link from "next/link";
import { ArrowRight, Play, RefreshCw, ShieldCheck, Waypoints, Zap } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
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
            <p className={styles.heroBadge}><Zap size={14} aria-hidden />Free transfer comparison</p>
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
              <span className="sticker" data-tone="green" style={{ "--tilt": "-8deg", "--delay": "1.05s" } as React.CSSProperties}>Free to compare</span>
              <span className="sticker" data-tone="orange" style={{ "--tilt": "7deg", "--delay": "1.2s" } as React.CSSProperties}>No sign-up</span>
              <span className={`sticker ${styles.logoSticker}`} style={{ "--tilt": "-4deg", "--delay": "1.35s" } as React.CSSProperties}>
                <span className={styles.logoStack}>
                  {[["wise", "Wise"], ["remitly", "Remitly"], ["revolut", "Revolut"], ["western-union", "Western Union"]].map(([slug, name]) => <ProviderLogo key={slug} slug={slug!} name={name!} size={22} />)}
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
