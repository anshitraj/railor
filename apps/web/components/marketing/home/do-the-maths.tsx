"use client";

import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { useState } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { RailorMark } from "../../brand";
import type { RemittanceCostBenchmarks } from "@railor/core";
import styles from "./do-the-maths.module.css";

const STEPS = [0, 1000, 2000, 3000, 4000, 5000];
const CURRENCIES = ["USD", "GBP", "EUR"] as const;
const roll = { duration: 700, easing: "cubic-bezier(.22, 1, .36, 1)" };

/**
 * GetOn's "do the maths", with the World Bank's own medians: slide what you send
 * abroad each month and see what a bank, a typical transfer app and the cheapest
 * option on the route would take, and what picking the cheapest keeps in a year.
 */
export function DoTheMaths({ benchmarks }: { benchmarks: RemittanceCostBenchmarks }) {
  const [amount, setAmount] = useState(2000);
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("USD");
  const money = { style: "currency", currency, maximumFractionDigits: 0 } as const;
  const cents = { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";
  const rows = [
    { key: "bank", label: "Your bank", pct: benchmarks.bankPct, tone: "dark" },
    { key: "app", label: "A typical transfer app", pct: benchmarks.operatorPct, tone: "mid" },
    { key: "best", label: "The cheapest option on the route", pct: benchmarks.cheapestPct, tone: "best" },
  ] as const;
  const cost = (pct: number) => (amount * pct) / 100;
  const kept = (cost(benchmarks.bankPct) - cost(benchmarks.cheapestPct)) * 12;
  const fill = `${(amount / STEPS[STEPS.length - 1]!) * 100}%`;
  const bankMonthly = cost(benchmarks.bankPct);
  const months = bankMonthly > 0 ? Math.round((kept / bankMonthly) * 10) / 10 : 0;

  return (
    <div className={styles.panel}>
      <span className={`coin ${styles.coinA}`} data-metal="gold" aria-hidden>$</span>
      <span className={`coin ${styles.coinB}`} data-metal="silver" aria-hidden>€</span>
      <span className={`coin ${styles.coinC}`} data-metal="bronze" aria-hidden>₹</span>
      <div className={styles.left}>
        <p className={styles.label}>You send abroad a month</p>
        <p className={styles.amount}><NumberFlow value={amount} locales="en-US" format={money} transformTiming={roll} />{amount >= 5000 ? <span>+</span> : null}</p>
        <div className={styles.slider} style={{ "--fill": fill } as React.CSSProperties}>
          <input type="range" min={0} max={5000} step={50} value={amount} onChange={(event) => setAmount(Number(event.target.value))} aria-label={`How much you send abroad each month, in ${currency}`} />
          <div className={styles.ticks} aria-hidden>{Array.from({ length: 26 }, (_, i) => <span key={i} data-major={i % 5 === 0 || undefined} />)}</div>
          <div className={styles.scale} aria-hidden>{STEPS.map((step) => <span key={step}>{step === 0 ? `${symbol}0` : `${symbol}${step / 1000}k${step === 5000 ? "+" : ""}`}</span>)}</div>
        </div>
        <div className={styles.toggle} role="group" aria-label="Currency you send">
          {CURRENCIES.map((code) => <button key={code} type="button" aria-pressed={code === currency} onClick={() => setCurrency(code)}>{code}</button>)}
        </div>
        <div className={styles.note}>
          <span className={styles.noteArt} aria-hidden><RailorMark size={30} /></span>
          <span><strong>Railor costs you nothing</strong>It finds the cheapest option. You pay the provider you choose, not us.</span>
          <span className={styles.noteMark} aria-hidden><Check size={14} strokeWidth={3} /></span>
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
                  {row.key === "bank" && amount > 0 ? <em><NumberFlow value={cost(row.pct)} locales="en-US" format={cents} transformTiming={roll} /> lost to fees and the rate</em> : null}
                </span>
              </div>
              <p className={styles.rowFoot}>{row.pct.toFixed(2)}% of what you send, the median</p>
            </div>
          ))}
        </div>
        <div className={styles.keep}>
          <div className={styles.keepTop}><span className={styles.keepTag}><ShieldCheck size={15} aria-hidden />Railor saved you money</span><RailorMark size={24} /></div>
          <div className={styles.keepRow}><span>You keep a year</span><strong><NumberFlow value={kept} locales="en-US" format={money} transformTiming={roll} /><i aria-hidden><Check size={13} strokeWidth={3.5} /></i></strong></div>
          {months > 0 ? <p className={styles.keepNote}>Railor found the cheapest way. That’s about {months} months of your bank’s fees, back in your pocket every year.</p> : null}
          <Link href="/#calculator" className={styles.keepLink}>Check your own route<ArrowRight size={15} aria-hidden /></Link>
        </div>
        <p className={styles.source}>Medians from <a href={benchmarks.sourceUrl} target="_blank" rel="noreferrer noopener">{benchmarks.attribution}</a>, {benchmarks.period}, across {benchmarks.corridors} routes. Your route will differ; compare it for today’s prices.</p>
      </div>
    </div>
  );
}
