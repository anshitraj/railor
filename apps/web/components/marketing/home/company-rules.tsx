import Link from "next/link";
import { ArrowRight, Check, Flag as FlagIcon, LoaderCircle, Scale, ShieldCheck, Timer, UsersRound } from "lucide-react";
import { Flag } from "@railor/ui";
import { LoopOnView } from "./loop-on-view";
import home from "./home.module.css";
import styles from "./rules.module.css";

const RULES = [
  { label: "Total cost under 1%", result: "0.62%" },
  { label: "Arrives within 2 days", result: "1 day" },
  { label: "Evidence checked in the last 30 days", result: "6 days ago" },
  { label: "Approved providers only", result: "Match" },
] as const;

/** Company rules, shown working: one payment checked against each rule, then routed to a teammate. */
export function CompanyRulesSection() {
  return (
    <section className={home.section} aria-labelledby="rules-title">
      <div className={home.container}>
        <div className={styles.layout}>
          <div>
            <p className={home.eyebrow}>For businesses</p>
            <h2 id="rules-title" className={home.title}>Set the rules once. Every payment follows them.</h2>
            <p className={home.lead}>Company rules turn your payment policy into checks Railor runs on every route — and a teammate signs off when an amount needs it.</p>
            <ul className={styles.points}>
              <li><span><ShieldCheck size={16} aria-hidden /></span><div><strong>Approved and blocked providers</strong><p>Keep payments on the providers your team trusts.</p></div></li>
              <li><span><Scale size={16} aria-hidden /></span><div><strong>Cost and delivery limits</strong><p>Rule out routes that cost too much or arrive too late.</p></div></li>
              <li><span><UsersRound size={16} aria-hidden /></span><div><strong>Team review above an amount</strong><p>Large payments wait for a second person.</p></div></li>
              <li><span><Timer size={16} aria-hidden /></span><div><strong>A record of every check</strong><p>Each decision keeps its rules, reasons and sources.</p></div></li>
            </ul>
            <Link href={`/login?intent=start&next=${encodeURIComponent("/app/policies")}`} className={`${home.btn} ${home.btnPrimary} press`}>Set up company rules<ArrowRight size={17} aria-hidden /></Link>
          </div>

          <LoopOnView className={`${styles.stage} ${styles.loop}`}>
            <div className={styles.card} aria-label="Example rule check" role="img">
              <div className={styles.payment}>
                <div>
                  <p className={styles.kicker}>Example · pay a supplier</p>
                  <p className={styles.amount}>$25,000 <span>USD → AED</span></p>
                </div>
                <span className={styles.flags}><Flag code="US" size={30} round /><Flag code="AE" size={30} round /></span>
              </div>
              <div className={styles.rulesHead}><span>Company rules</span><span className={styles.version}>Version 3 · active</span></div>
              <ol className={styles.rules}>
                {RULES.map((rule, index) => (
                  <li key={rule.label} className={styles.rule}>
                    <span className={styles.status}>
                      <span className={styles.pending} data-anim style={{ animationDelay: `${index * 0.45}s` }}><LoaderCircle size={15} /></span>
                      <span className={styles.pass} data-anim style={{ animationDelay: `${index * 0.45}s` }}><Check size={14} strokeWidth={3} /></span>
                    </span>
                    <span className={styles.ruleLabel}>{rule.label}</span>
                    <span className={styles.ruleResult} data-anim style={{ animationDelay: `${index * 0.45}s` }}>{rule.result}</span>
                  </li>
                ))}
                <li className={styles.rule}>
                  <span className={styles.status}>
                    <span className={styles.pending} data-anim style={{ animationDelay: "1.8s" }}><LoaderCircle size={15} /></span>
                    <span className={styles.flag} data-anim style={{ animationDelay: "1.8s" }}><FlagIcon size={13} strokeWidth={2.6} /></span>
                  </span>
                  <span className={styles.ruleLabel}>Team review above $10,000</span>
                  <span className={styles.ruleResult} data-anim data-tone="warn" style={{ animationDelay: "1.8s" }}>Needed</span>
                </li>
              </ol>
              <div className={styles.result} data-anim>
                <UsersRound size={16} />
                <span><strong>Waiting for approval</strong>Sent to a workspace admin for review</span>
              </div>
            </div>
            <span className={`sticker ${styles.sticker}`} data-tone="green" data-anim style={{ "--tilt": "5deg" } as React.CSSProperties}>✓ 4 of 5 rules passed</span>
          </LoopOnView>
        </div>
      </div>
    </section>
  );
}
