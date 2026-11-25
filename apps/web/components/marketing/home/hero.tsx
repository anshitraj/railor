import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Landmark, Play, ReceiptText, RefreshCw, ShieldCheck, Waypoints, Zap } from "lucide-react";
import { RailorMark } from "../../brand";
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
            <div className={styles.heroRoute} aria-hidden="true">
              <span className={styles.routeSignal} />
              <span className={styles.routeDeparture}><Landmark size={17} /><ArrowUpRight size={10} /></span>
              <span className={styles.routeJunction}><RailorMark size={25} /></span>
              <span className={styles.routeArrival}><ReceiptText size={17} /><Check size={10} /></span>
            </div>
            {calculator}
          </div>
        </div>

        <ProviderMarquee />
      </div>
    </section>
  );
}
