"use client";

import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { RemittanceCostBenchmarks } from "@railor/core";
import styles from "./do-the-maths.module.css";

const STEPS = [0, 1000, 2000, 3000, 4000, 5000];
const money = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;
const cents = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
const roll = { duration: 700, easing: "cubic-bezier(.22, 1, .36, 1)" };

/**
 * GetOn's "do the maths", with the World Bank's own medians: slide what you send
 * abroad each month and see what a bank, a typical transfer app and the cheapest
 * option on the route would take, and what picking the cheapest keeps in a year.
 */
export function DoTheMaths({ benchmarks }: { benchmarks: RemittanceCostBenchmarks }) {
  const [amount, setAmount] = useState(2000);
  const rows = [
    { key: "bank", label: "Your bank", pct: benchmarks.bankPct, tone: "dark" },
    { key: "app", label: "A typical transfer app", pct: benchmarks.operatorPct, tone: "mid" },
    { key: "best", label: "The cheapest option on the route", pct: benchmarks.cheapestPct, tone: "best" },
  ] as const;
  const cost = (pct: number) => (amount * pct) / 100;
  const kept = (cost(benchmarks.bankPct) - cost(benchmarks.cheapestPct)) * 12;
  const fill = `${(amount / STEPS[STEPS.length - 1]!) * 100}%`;

  return (
    <div className={styles.panel}>
      <div className={styles.left}>
        <p className={styles.label}>You send abroad a month</p>
        <p className={styles.amount}><NumberFlow value={amount} locales="en-US" format={money} transformTiming={roll} />{amount >= 5000 ? <span>+</span> : null}</p>
        <div className={styles.slider} style={{ "--fill": fill } as React.CSSProperties}>
          <input type="range" min={0} max={5000} step={50} value={amount} onChange={(event) => setAmount(Number(event.target.value))} aria-label="How much you send abroad each month, in US dollars" />
          <div className={styles.ticks} aria-hidden>{Array.from({ length: 26 }, (_, i) => <span key={i} data-major={i % 5 === 0 || undefined} />)}</div>
          <div className={styles.scale} aria-hidden>{STEPS.map((step) => <span key={step}>{step === 0 ? "$0" : `$${step / 1000}k${step === 5000 ? "+" : ""}`}</span>)}</div>
        </div>
        <div className={styles.note}>
          <span className={styles.noteMark} aria-hidden><Check size={15} strokeWidth={3} /></span>
          <span><strong>Railor is free to compare</strong>It shows you the cheapest option. You pay the provider you choose, not us.</span>
        </div>
      </div>

      <div className={styles.right}>
        <h3>Where your money goes</h3>
        <p className={styles.subtle}>The same <NumberFlow value={amount} locales="en-US" format={money} transformTiming={roll} />, three ways to send it.</p>
        <div className={styles.rows}>
          {rows.map((row) => (
            <div key={row.key} className={styles.row}>
              <div className={styles.rowHead}><span>{row.label}</span><strong><NumberFlow value={cost(row.pct)} locales="en-US" format={cents} transformTiming={roll} /></strong></div>
              <div className={styles.track}>
                <span className={styles.bar} data-tone={row.tone} style={{ width: `${Math.max(2, (row.pct / benchmarks.bankPct) * 100)}%` }}>
                  {row.key === "bank" && amount > 0 ? <em>lost to fees and the rate</em> : null}
                </span>
              </div>
              <p className={styles.rowFoot}>{row.pct.toFixed(2)}% of what you send, the median</p>
            </div>
          ))}
        </div>
        <div className={styles.keep}>
          <span className={styles.keepTag}><Check size={13} strokeWidth={3} aria-hidden />Pick the cheapest with Railor</span>
          <div className={styles.keepRow}><span>You keep a year</span><strong><NumberFlow value={kept} locales="en-US" format={money} transformTiming={roll} /></strong></div>
          <Link href="/#calculator" className={styles.keepLink}>Check your own route<ArrowRight size={15} aria-hidden /></Link>
        </div>
        <p className={styles.source}>Medians from <a href={benchmarks.sourceUrl} target="_blank" rel="noreferrer noopener">{benchmarks.attribution}</a>, {benchmarks.period}, across {benchmarks.corridors} routes. Your route will differ; compare it for today’s prices.</p>
      </div>
    </div>
  );
}
