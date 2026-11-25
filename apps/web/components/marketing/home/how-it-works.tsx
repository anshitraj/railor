import { Check, LoaderCircle } from "lucide-react";
import { Flag } from "@railor/ui";
import { ProviderLogo } from "../../app/provider-logo";
import { LoopOnView } from "./loop-on-view";
import { MobileCardSlider } from "./mobile-card-slider";
import styles from "./home.module.css";

const CHECKING = [
  { slug: "wise", name: "Wise", amount: "₹92,369" },
  { slug: "remitly", name: "Remitly", amount: "₹92,102" },
  { slug: "xoom", name: "Xoom", amount: "₹91,880" },
  { slug: "revolut", name: "Revolut", amount: "Hidden" },
];

/**
 * Three short product loops, not illustrations: each card replays the real
 * calculator doing one job. Figures are an illustrative example, labelled as such.
 */
export function HowItWorks() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="how-title">
      <div className={styles.container}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="how-title" className={styles.title}>Compare a transfer in three steps.</h2>
          </div>
          <p className={styles.lead}>See how much arrives, what it costs and where each price comes from.</p>
        </div>

        <MobileCardSlider mode="steps" label="How Railor works" labels={["Choose an amount", "Compare providers", "Check the details"]}>
          <li className={styles.step}>
            <LoopOnView className={`${styles.stepStage} ${styles.loop}`} once>
              <div className={styles.mini} aria-hidden>
                <p className={styles.miniLabel}>Sending</p>
                <div className={styles.miniField}>
                  <span className={styles.miniAmount}><span className={styles.typed} data-anim>1,000</span><span className={styles.caret} data-anim /></span>
                  <span className={styles.miniPill}><Flag code="US" size={20} round />USD</span>
                </div>
                <p className={styles.miniLabel} style={{ marginTop: 10 }}>Arrives in</p>
                <div className={styles.miniField}>
                  <span className={styles.miniAmount} style={{ fontSize: 18, color: "var(--color-muted)" }}>India</span>
                  <span className={styles.miniPill}><Flag code="IN" size={20} round />INR</span>
                </div>
              </div>
            </LoopOnView>
            <div className={styles.stepBody}>
              <span className={styles.stepNumber}>1</span>
              <h3>Choose an amount</h3>
              <p>Tap a preset or type any amount, then pick the two currencies.</p>
            </div>
          </li>

          <li className={styles.step}>
            <LoopOnView className={`${styles.stepStage} ${styles.loop}`} once>
              <div className={`${styles.mini} ${styles.miniRows}`} aria-hidden>
                <p className={styles.miniLabel}>Example payouts</p>
                {CHECKING.map((row, index) => (
                  <div key={row.slug} className={styles.miniRow}>
                    <ProviderLogo slug={row.slug} name={row.name} size={26} />
                    <strong>{row.name}</strong>
                    <span className={styles.miniStatus}>
                      <span className={styles.miniChecking} data-anim style={{ animationDelay: `${index * 0.28}s` }}><LoaderCircle size={14} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> Checking</span>
                      <span className={styles.miniDone} data-anim style={{ animationDelay: `${index * 0.28}s`, color: row.amount === "Hidden" ? "var(--color-muted)" : undefined }}>
                        {row.amount === "Hidden" ? "Ineligible" : <><Check size={14} aria-hidden /><span>{row.amount}</span></>}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </LoopOnView>
            <div className={styles.stepBody}>
              <span className={styles.stepNumber}>2</span>
              <h3>Compare providers</h3>
              <p>See live quotes, published fees and recent estimates for your transfer.</p>
            </div>
          </li>

          <li className={styles.step}>
            <LoopOnView className={`${styles.stepStage} ${styles.loop}`} once>
              <div className={styles.mini} aria-hidden>
                <div className={styles.receiptHead}>
                  <ProviderLogo slug="wise" name="Wise" size={32} />
                  <div><strong>Wise</strong><small>Public quote · example</small></div>
                </div>
                <dl className={styles.receipt}>
                  {[["Arrives", "₹92,369.57"], ["Fee", "$11.26"], ["Rate", "1 USD = 93.42 INR"], ["Source", "wise.com"]].map(([label, value], index) => (
                    <div key={label} data-anim style={{ animationDelay: `${index * 0.11}s` }}><dt>{label}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </div>
            </LoopOnView>
            <div className={styles.stepBody}>
              <span className={styles.stepNumber}>3</span>
              <h3>Check the details</h3>
              <p>Open a price to see the exchange rate, fee, delivery estimate and source.</p>
            </div>
          </li>
        </MobileCardSlider>
      </div>
    </section>
  );
}
