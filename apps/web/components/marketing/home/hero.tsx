import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChartNoAxesColumnIncreasing, Check, Landmark, ReceiptText } from "lucide-react";
import { RailorMark } from "../../brand";
import { ProviderMarquee } from "./provider-marquee";
import styles from "./home.module.css";

/** First screen: what Railor does in one line, and the calculator that does it. */
export function HomeHero({ calculator }: { calculator: React.ReactNode }) {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroGlow} aria-hidden />
      <div className={styles.container}>
        <div className={styles.heroInner}>
          <div className={styles.heroIntro}>
            <p className={styles.heroLabel}><ChartNoAxesColumnIncreasing size={15} aria-hidden />Free transfer comparison</p>
            <h1 id="home-title" className={styles.heroTitle}>
              <span>Move money abroad.</span>
              <span>
                Keep{" "}
                <span className={styles.underline}>
                  more of it.
                </span>
              </span>
            </h1>
            <p className={styles.heroLead}>
              Compare exchange rates, fees and what arrives across banks and transfer apps before you send.
            </p>
          </div>
          <div className={styles.heroExtras}>
            <div className={styles.heroActions}>
              <Link href="/prices" className={`${styles.btn} ${styles.btnPrimary} press`}>Compare prices<ArrowRight size={17} aria-hidden /></Link>
              <Link href="/login?intent=start" className={`${styles.btn} ${styles.btnSecondary} press`}>Create account</Link>
            </div>
            <ul className={styles.heroProof}>
              <li><Check size={16} aria-hidden />No account needed to compare</li>
              <li><Check size={16} aria-hidden />Source and time on every price</li>
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
