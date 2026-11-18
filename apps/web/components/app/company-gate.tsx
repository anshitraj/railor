import Link from "next/link";
import { ArrowRight, Building2, Check } from "lucide-react";
import styles from "./company-tools.module.css";

/** Shown in place of a company tool in a personal or freelancer workspace. */
export function CompanyGate({ feature, next }: { feature: string; next: string }) {
  return (
    <section className={styles.gate} aria-labelledby="company-gate-title">
      <span className={styles.gateIcon}><Building2 size={22} aria-hidden /></span>
      <h1 id="company-gate-title">{feature} is a company tool</h1>
      <p>This workspace is set up for personal or freelance use, so company tools are off. Prices, routes, invoices and alerts all work as before.</p>
      <ul>
        {["Company rules and team reviews", "Payment audit against your bank statement", "Payroll pricing for every employee payout"].map((item) => <li key={item}><Check size={14} aria-hidden />{item}</li>)}
      </ul>
      <Link href={`/welcome?next=${encodeURIComponent(next)}`} className={`${styles.primary} press`}>Switch to a company workspace <ArrowRight size={15} aria-hidden /></Link>
    </section>
  );
}
