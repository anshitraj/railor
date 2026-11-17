import Link from "next/link";
import { ArrowRight, Check, Zap } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import styles from "./home.module.css";

const LOGOS = [
  { slug: "wise", name: "Wise" },
  { slug: "remitly", name: "Remitly" },
  { slug: "xoom", name: "Xoom" },
  { slug: "revolut", name: "Revolut" },
  { slug: "skydo", name: "Skydo" },
  { slug: "payzoll", name: "PayZoll" },
  { slug: "razorpay", name: "Razorpay" },
  { slug: "xflow", name: "Xflow" },
];

/** First screen: what Railor does in one line, and the calculator that does it. */
export function HomeHero({ calculator }: { calculator: React.ReactNode }) {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroGlow} aria-hidden />
      <div className={styles.container}>
        <div className={styles.heroInner}>
          <div className={styles.heroIntro}>
            <p className={styles.pill}><span className={styles.pillIcon}><Zap size={12} aria-hidden /></span>Free price comparison<span className={styles.hideSmall}>, updated every 30 seconds</span></p>
            <h1 id="home-title" className={styles.heroTitle}>
              <span>Move money abroad.</span>
              <span>
                Keep{" "}
                <span className={styles.underline}>
                  more of it.
                  <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden>
                    <path d="M2 8.5C40 3.5 120 2 198 6.5" pathLength={1} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </span>
              </span>
            </h1>
            <p className={styles.heroLead}>
              Railor compares fees and exchange rates across money transfer apps, banks and payment platforms — and shows exactly what arrives before you send.
            </p>
          </div>
          <div className={styles.heroExtras}>
            <div className={styles.heroActions}>
              <Link href="/login?intent=start" className={`${styles.btn} ${styles.btnPrimary} press`}>Get started free<ArrowRight size={17} aria-hidden /></Link>
              <Link href="/prices" className={`${styles.btn} ${styles.btnSecondary} press`}>See every price</Link>
            </div>
            <ul className={styles.heroProof}>
              <li><Check size={16} aria-hidden />No sign-up to compare</li>
              <li><Check size={16} aria-hidden />A source on every price</li>
              <li><Check size={16} aria-hidden />Personal, freelancer and business</li>
            </ul>
          </div>
          <div className={styles.heroCalc} id="calculator">{calculator}</div>
        </div>

        <div className={styles.logos}>
          <p>Compare prices from providers like</p>
          <ul className={styles.logoRow}>
            {LOGOS.map((logo) => (
              <li key={logo.slug}><ProviderLogo slug={logo.slug} name={logo.name} size={26} loading="eager" />{logo.name}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
