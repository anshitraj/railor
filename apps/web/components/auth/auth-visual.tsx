import { Check, ShieldCheck } from "lucide-react";
import { Flag } from "@railor/ui";
import { ProviderLogo } from "../app/provider-logo";
import styles from "./auth-visual.module.css";

/** The sign-in side panel: what you get, shown as the product rather than described. */
export function AuthVisual() {
  return (
    <div className={styles.visual} aria-hidden>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.flags}><Flag code="US" size={26} round /><Flag code="IN" size={26} round /></span>
          <span className={styles.pair}>1,000 USD → INR</span>
          <span className={styles.live}><i />Live</span>
        </div>
        <div className={styles.best}>
          <ProviderLogo slug="wise" name="Wise" size={36} loading="eager" />
          <div><strong>Wise</strong><small>Public quote · example</small></div>
          <span className={styles.amount}>₹92,369</span>
        </div>
        <ul className={styles.list}>
          <li><ProviderLogo slug="remitly" name="Remitly" size={26} loading="eager" /><span>Remitly</span><em>Estimate</em></li>
          <li><ProviderLogo slug="xoom" name="Xoom" size={26} loading="eager" /><span>Xoom</span><em>Estimate</em></li>
        </ul>
      </div>
      <div className={styles.rule}><ShieldCheck size={16} />Company rules passed<Check size={15} /></div>
      <span className="sticker" data-tone="orange" style={{ "--tilt": "-7deg", "--delay": ".5s", position: "absolute", top: -14, right: 28 } as React.CSSProperties}>Best price</span>
      <span className="coin" data-metal="gold" style={{ "--size": "64px", position: "absolute", left: -22, bottom: 34, rotate: "-12deg" } as React.CSSProperties}>$</span>
      <span className="coin" data-metal="silver" style={{ "--size": "48px", position: "absolute", right: -10, bottom: -6, rotate: "10deg" } as React.CSSProperties}>₹</span>
    </div>
  );
}
