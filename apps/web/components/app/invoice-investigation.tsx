"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, Check, FileText, Info, Landmark, Loader2, Percent, Receipt, ScanSearch, ShieldCheck, Sparkles, TrendingDown, Waypoints } from "lucide-react";
import type { ChargeKind, Settlement, ShortfallCause, ShortfallReport } from "@railor/core";
import { currencyDecimals, modelLabel, money } from "../../lib/format-money";
import styles from "./invoice-investigation.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;
const KIND: Record<ChargeKind, { label: string; icon: typeof Info }> = {
  provider_fee: { label: "Provider fee", icon: Receipt },
  tax: { label: "Tax", icon: Percent },
  fx_markup: { label: "Exchange-rate margin", icon: TrendingDown },
  intermediary: { label: "Intermediary bank", icon: Waypoints },
  bank_charge: { label: "Bank charge", icon: Landmark },
  document_fee: { label: "Document fee", icon: FileText },
  other: { label: "Other charge", icon: Info },
};
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** Reassurance while Gemini and Railor work: each line is something that is really happening. */
function useSteps(running: boolean, steps: string[]) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!running) { setIndex(0); return; }
    const timer = window.setInterval(() => setIndex((value) => Math.min(value + 1, steps.length - 1)), 3400);
    return () => window.clearInterval(timer);
  }, [running, steps.length]);
  return steps[index]!;
}

export interface InvestigationProps {
  settlement: Settlement;
  provider: string;
  invoiceCurrency: string;
  settlementCurrency: string;
  report: ShortfallReport | null;
  running: boolean;
  error: string | null;
  /** Labels already counted as named charges on the credit. */
  counted: ReadonlySet<string>;
  counting: string | null;
  reduce: boolean;
  onRun: () => void;
  onCount: (label: string, amount: number) => Promise<void>;
}

/**
 * The money that isn't accounted for, investigated: the rate that actually
 * arrived, and the charges the provider's own pages say are taken on top of
 * the quoted fee. Nothing is counted until the person taps it.
 */
export function Investigation({ settlement: s, provider, invoiceCurrency, settlementCurrency: c, report, running, error, counted, counting, reduce, onRun, onCount }: InvestigationProps) {
  const missing = Math.max(0, -s.unexplained);
  const step = useSteps(running, [`Reading ${provider}’s own fee pages`, "Checking for tax and charges on top of the fee", "Comparing the rate you got with mid-market", "Verifying every quote against the page"]);
  if (missing <= s.tolerance && !report) return null;

  const usable = report?.causes.filter((cause) => cause.official && cause.amount !== null && cause.fits && !counted.has(cause.label)) ?? [];
  const potential = Math.min(missing, usable.reduce((sum, cause) => sum + (cause.amount ?? 0), 0));
  const left = Math.max(0, missing - potential);

  return (
    <section className={styles.card} aria-label="Why the credit is short" aria-busy={running}>
      <header className={styles.head}>
        <span className={styles.badge}><ScanSearch size={15} aria-hidden /></span>
        <div>
          <h3>Where could it have gone?</h3>
          <small>{report ? <>Checked by {modelLabel(report.model)} with Google Search · {report.pages.length} page{report.pages.length === 1 ? "" : "s"} read</> : `Gemini reads ${provider}’s own pages`}</small>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {running ? (
          <motion.div key="running" className={styles.scan} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} role="status">
            <span className={styles.scanBar} aria-hidden><i /></span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={step} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ duration: 0.25, ease: EASE }}>
                <Loader2 size={14} className={styles.spin} aria-hidden />{step}…
              </motion.p>
            </AnimatePresence>
          </motion.div>
        ) : error && !report ? (
          <motion.div key="error" className={styles.error} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} role="alert">
            <p><AlertTriangle size={14} aria-hidden />{error}</p>
            <button type="button" onClick={onRun}>Try again</button>
          </motion.div>
        ) : report ? (
          <motion.div key="report" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            {report.rate ? <RateTerms rate={report.rate} currency={c} per={invoiceCurrency} reduce={reduce} /> : null}

            {report.causes.length ? (
              <ul className={styles.causes}>
                {report.causes.map((cause, index) => (
                  <motion.li key={cause.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : 0.12 + index * 0.08 }}>
                    <Cause cause={cause} currency={c} provider={provider} counted={counted.has(cause.label)} busy={counting === cause.label} onCount={onCount} />
                  </motion.li>
                ))}
              </ul>
            ) : <p className={styles.none}><Info size={14} aria-hidden /><span>{report.note ?? `${provider}’s pages don’t list a charge taken on top of the quoted price.`}</span></p>}

            <div className={styles.summary} data-clear={left <= s.tolerance || undefined}>
              {missing <= s.tolerance ? <p><Check size={15} aria-hidden /><span><strong>Everything is accounted for.</strong></span></p>
                : potential > 0 ? <p><Sparkles size={15} aria-hidden /><span>If the charges above apply, up to <strong>{money(potential, c)}</strong> of the missing <strong>{money(missing, c)}</strong> is explained{left > s.tolerance ? <>, leaving <strong>{money(left, c)}</strong> to ask {provider} about</> : null}.</span></p>
                : <p><AlertTriangle size={15} aria-hidden /><span>{provider}’s pages don’t put a figure on this. <strong>{money(missing, c)}</strong> is still unaccounted for — ask {provider}, or check the credit advice from your bank.</span></p>}
              {usable.length > 1 ? (
                <button type="button" className={styles.countAll} disabled={counting !== null} onClick={async () => { for (const cause of usable) await onCount(cause.label, cause.amount!); }}>
                  {counting ? <Loader2 size={13} className={styles.spin} aria-hidden /> : <Check size={13} aria-hidden />}Count all {usable.length} that fit
                </button>
              ) : null}
            </div>

            <div className={styles.foot}><button type="button" className={styles.again} disabled={running} onClick={onRun}><ScanSearch size={12} aria-hidden />Check again</button></div>
            <details className={styles.proof}>
              <summary><ShieldCheck size={13} aria-hidden />How this was checked</summary>
              <p>Gemini searched with Google Search. Railor then opened each page itself and kept a charge only if its sentence appears on the page. Amounts are worked out by Railor from the figure printed in that sentence; the model never supplies one, and nothing is counted until you tap it.{report.note && report.causes.length ? ` ${report.note}` : ""}</p>
              <ul>{report.pages.map((page) => <li key={page.url}><a href={page.url} target="_blank" rel="noreferrer noopener">{page.title || host(page.url)}<ArrowUpRight size={11} aria-hidden /></a><span>{host(page.url)}</span></li>)}</ul>
            </details>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function RateTerms({ rate, currency, per, reduce }: { rate: NonNullable<ShortfallReport["rate"]>; currency: string; per: string; reduce: boolean }) {
  const got = rate.belowMidPct;
  const quoted = rate.quotedBelowMidPct;
  if (rate.midRate === null || got === null) return <p className={styles.rate}>You received <strong>{money(rate.effectiveRate, currency)}</strong> for each {per}. We couldn’t fetch mid-market for that day to compare.</p>;
  const scale = Math.max(Math.abs(got), Math.abs(quoted ?? 0), 0.5);
  const bar = (value: number, tone: "quoted" | "got", delay: number) => (
    <span className={styles.rateBar} data-tone={tone}><motion.i initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.min(100, (Math.abs(value) / scale) * 100)}%` }} transition={{ duration: 0.7, ease: EASE, delay }} /></span>
  );
  return (
    <div className={styles.rate}>
      <p>You received <strong>{money(rate.effectiveRate, currency)}</strong> for each {per}. Mid-market that day was <strong>{money(rate.midRate, currency)}</strong>.</p>
      <div className={styles.rateBars}>
        {quoted !== null ? <div><span>Your quote assumed</span>{bar(quoted, "quoted", 0.15)}<em>{quoted}% below</em></div> : null}
        <div><span>You got</span>{bar(got, "got", 0.3)}<em data-bad={quoted !== null && got > quoted + 0.3 || undefined}>{got}% below</em></div>
      </div>
    </div>
  );
}

function Cause({ cause, currency, provider, counted, busy, onCount }: { cause: ShortfallCause; currency: string; provider: string; counted: boolean; busy: boolean; onCount: (label: string, amount: number) => Promise<void> }) {
  const kind = KIND[cause.kind];
  const [typed, setTyped] = useState("");
  const decimals = currencyDecimals(currency);
  const manual = Number(typed.replace(/[^\d.]/g, ""));
  return (
    <article className={styles.cause} data-counted={counted || undefined}>
      <div className={styles.causeTop}>
        <span className={styles.causeIcon}><kind.icon size={15} aria-hidden /></span>
        <div><strong>{cause.label}</strong><small>{kind.label}</small></div>
        <span className={styles.source} data-official={cause.official || undefined}>{cause.official ? <><ShieldCheck size={11} aria-hidden />{provider}’s own page</> : "Third-party page"}</span>
      </div>
      <blockquote>“{cause.quote}”</blockquote>
      <a className={styles.link} href={cause.sourceUrl} target="_blank" rel="noreferrer noopener">{cause.sourceTitle || host(cause.sourceUrl)} · {host(cause.sourceUrl)}<ArrowUpRight size={11} aria-hidden /></a>
      <div className={styles.causeAction}>
        {counted ? <span className={styles.counted}><Check size={14} aria-hidden />Counted as a charge</span>
          : cause.official && cause.amount !== null ? (
            <>
              <span className={styles.amount}>−{money(cause.amount, currency)}<small>{cause.fits ? "if this applied" : "more than what’s missing"}</small></span>
              <button type="button" className={styles.count} disabled={busy || !cause.fits} onClick={() => void onCount(cause.label, cause.amount!)}>{busy ? <Loader2 size={13} className={styles.spin} aria-hidden /> : <Check size={13} aria-hidden />}Count {money(cause.amount, currency)}</button>
            </>
          ) : (
            <>
              <span className={styles.amount}><small>{cause.official ? "No figure printed. Know the amount?" : "Not confirmed by the provider. Know the amount?"}</small></span>
              <label className={styles.manual}><span aria-hidden>{currency}</span><input inputMode="decimal" aria-label={`Amount of ${cause.label}`} placeholder="0.00" value={typed} onChange={(event) => setTyped(event.target.value.replace(/[^\d.]/g, ""))} /></label>
              <button type="button" className={styles.count} disabled={busy || !(manual > 0)} onClick={() => void onCount(cause.label, Number(manual.toFixed(decimals)))}>{busy ? <Loader2 size={13} className={styles.spin} aria-hidden /> : <Check size={13} aria-hidden />}Count it</button>
            </>
          )}
      </div>
    </article>
  );
}
