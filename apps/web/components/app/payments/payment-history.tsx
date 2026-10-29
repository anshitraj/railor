"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChartNoAxesCombined, Check, CheckCircle2, ChevronRight, Clock3, FlaskConical, History, Info, Landmark, Link2, Search, Settings2, ShieldCheck, X } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import type { PaymentHistorySummary } from "../../../lib/payment-history";
import { CurrencyLogo } from "../../marketing/currency-logo";
import { RailorMark } from "../../marketing/nav";
import { ProviderLogo } from "../provider-logo";
import { PaymentStatusBadge, formatAmount } from "./payment-status";
import styles from "./payment-history.module.css";

export interface PaymentHistoryRecord {
  id: string; status: string; amount: string; sourceCurrency: string; destinationCurrency: string;
  provider: string | null; beneficiaryLabel: string; beneficiaryHint: string; reference: string | null; createdAt: string;
}
export interface PaymentHistoryProps {
  mode: "test" | "live"; status?: string; rows: PaymentHistoryRecord[]; summary: PaymentHistorySummary;
  filters: Array<{ value: string; label: string; count: number }>; paused: boolean; pausedReason?: string | null;
}

function CurrencyMark({ symbol }: { symbol: string }) {
  const country = currencyFlagCode(symbol);
  return country ? <Flag code={country} size={14} /> : <CurrencyLogo symbol={symbol} size={19} />;
}

function HistoryIllustration() {
  const reduced = useReducedMotion();
  return <motion.div className={styles.illustration} aria-hidden initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <svg width="112" height="98" viewBox="0 0 112 98" fill="none">
      <path d="M17 84H94" stroke="currentColor" opacity=".12" />
      <rect x="25" y="12" width="61" height="70" rx="12" fill="var(--color-surface, #fff)" stroke="currentColor" strokeOpacity=".3" />
      <rect x="44" y="8" width="24" height="9" rx="4.5" fill="var(--color-paper, #f6f4ee)" stroke="currentColor" strokeOpacity=".24" />
      <path d="M39 33H56M39 45H71M39 57H63M39 69H52" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
      <path d="M13 30H20M89 11L94 5M95 24H103" stroke="var(--color-orange)" strokeWidth="1.5" strokeLinecap="round" />
    </svg><span className={styles.illustrationMark}><RailorMark size={33} /><span><Check size={10} strokeWidth={3} /></span></span>
  </motion.div>;
}

export function PaymentHistory({ mode, status, rows, summary, filters, paused, pausedReason }: PaymentHistoryProps) {
  const [query, setQuery] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const activeFilter = filters.find((filter) => filter.value === status);
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => !needle || [row.id, row.reference, row.provider, row.beneficiaryLabel, row.beneficiaryHint, row.sourceCurrency, row.destinationCurrency, row.status.replaceAll("_", " "), row.amount].some((value) => value?.toLowerCase().includes(needle)));
  const href = (nextMode = mode, nextStatus?: string) => `/app/payments?${new URLSearchParams({ mode: nextMode, ...(nextStatus ? { status: nextStatus } : {}) })}`;
  const number = (value: number) => value.toLocaleString("en-US");

  return <div className={styles.page}>
    <header className={styles.header}><p className="product-eyebrow">Workspace / activity</p><h1>History</h1><p>Your payment records, from first check to final status.<br className={styles.desktopBreak} /> Test runs and live activity stay separate.</p></header>

    <section className={styles.metrics} aria-label={`${mode === "test" ? "Test" : "Live"} history summary`}>
      <article className={styles.metric}><span className={styles.metricIcon} data-tone="good"><CheckCircle2 size={22} /></span><div><h2>Completed payments</h2><strong>{number(summary.completed)}</strong><p>Created in the last 30 days</p></div></article>
      <article className={styles.metric}><span className={styles.metricIcon} data-tone="accent"><Clock3 size={22} /></span><div><h2>Open payments</h2><strong>{number(summary.open)}</strong><p>Awaiting completion · all time</p></div></article>
      <article className={styles.metric}><span className={styles.metricIcon}><Landmark size={22} /></span><div><h2>Connected providers</h2><strong>{number(summary.connectedProviders)}</strong><p>{mode === "test" ? "In the sandbox environment" : "In the production environment"}</p></div></article>
      <article className={styles.metric}><span className={styles.metricIcon} data-tone="good"><ChartNoAxesCombined size={22} /></span><div><h2>Success rate</h2><strong>{summary.successRate === null ? "—" : `${summary.successRate}%`}</strong><p>{summary.successRate === null ? "No concluded records in 30 days" : "Among concluded records · 30 days"}</p></div>
        <details className={styles.metricInfo}><summary aria-label="How success rate is calculated"><Info size={14} /></summary><p>Completed ÷ (completed + failed + returned), for payments created in the last 30 days. Pending, blocked and cancelled records are excluded. No concluded records means no rate.</p></details>
      </article>
    </section>

    <div className={styles.toolbar}>
      <nav className={styles.modeSwitch} aria-label="History environment">{(["test", "live"] as const).map((item) => <Link key={item} href={href(item)} aria-current={mode === item ? "page" : undefined}>{item === "test" ? "Test" : "Live"}</Link>)}</nav>
      <span className={styles.environment} data-live={mode === "live"}><span />{mode === "test" ? "Sandbox history" : "Live history"}</span>
      <span className={styles.toolbarNote}>{mode === "test" ? "Sandbox and simulated records only" : "Production records only"}</span>
      <div className={styles.toolbarLinks}><Link href="/app/routing"><Settings2 size={14} />Routing settings</Link><Link href="/app/settings/connections"><Link2 size={14} />Connections<ChevronRight size={13} /></Link></div>
    </div>

    {!bannerDismissed && <div className={styles.banner} role="status"><Info size={19} /><div><strong>{mode === "test" ? "You’re viewing test history" : "You’re viewing live history"}</strong><p>{mode === "test" ? "Sandbox and simulated payments appear here. Test outcomes do not represent real money movement." : "Only production payment records appear here. Switch to Test to review sandbox activity."}</p></div><button type="button" aria-label="Dismiss environment notice" onClick={() => setBannerDismissed(true)}><X size={15} /></button></div>}
    {paused && <div className={styles.pause} role="status"><ShieldCheck size={18} /><p><strong>Payment submissions are paused.</strong> {pausedReason || "Existing records remain available and open payments can continue settling."}</p></div>}

    <div className={styles.mainGrid}>
      <section className={styles.records} aria-label="Payment history records">
        <nav className={styles.filters} aria-label="Filter history by status"><Link href={href()} aria-current={!status ? "page" : undefined}>All<span>{number(summary.total)}</span></Link>{filters.map((filter) => <Link key={filter.value} href={href(mode, filter.value)} aria-current={status === filter.value ? "page" : undefined}>{filter.label}<span>{number(filter.count)}</span></Link>)}</nav>
        <div className={styles.searchbar}><label><Search size={15} /><input type="search" aria-label="Search loaded history" placeholder="Search recipient, provider or reference" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear history search"><X size={14} /></button>}</div>
        <div className={styles.listHeading}><h2>{activeFilter ? `${activeFilter.label} records` : "Recent activity"}</h2><span aria-live="polite">{number(visible.length)} {visible.length === 1 ? "record" : "records"}{rows.length === 100 ? " · latest 100 loaded" : ""}</span></div>
        {visible.length ? <div className={styles.table}>
          <div className={styles.tableHead} aria-hidden><span>Payment / recipient</span><span>Amount</span><span>Status</span><span /></div>
          {visible.map((row) => <Link href={`/app/payments/${row.id}`} className={styles.record} key={row.id}>
            <span className={styles.recordIdentity}><span className={styles.providerMark}>{row.provider ? <ProviderLogo slug={row.provider} name={row.provider} size={29} /> : <History size={20} />}</span><span><strong>{row.beneficiaryLabel}</strong><small>{row.provider ?? "Provider not selected"}<span> · </span><time dateTime={row.createdAt}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(row.createdAt))}</time></small><span className={styles.recordReference}>{row.reference || row.beneficiaryHint || `Ref ${row.id.slice(0, 8)}`}</span></span></span>
            <span className={styles.recordAmount}><strong><CurrencyMark symbol={row.sourceCurrency} />{formatAmount(row.amount, row.sourceCurrency)}</strong><small><ArrowRight size={11} />{row.destinationCurrency}</small></span>
            <span className={styles.recordStatus}><PaymentStatusBadge status={row.status} /></span><ChevronRight size={15} className={styles.recordArrow} aria-hidden />
          </Link>)}
        </div> : <div className={styles.empty}>
          <HistoryIllustration />
          <h3>{needle ? "No matching records" : activeFilter ? `No ${activeFilter.label.toLowerCase()} records` : `No ${mode === "test" ? "test" : "live"} payments yet`}</h3>
          <p>{needle ? "Try a recipient, provider, currency or payment reference in this view." : activeFilter ? "There are no records with this status in the selected environment. View all statuses to explore the rest of your history." : "Your existing payments will appear here with their provider and latest status. You can explore prices and routes while new payments are unavailable."}</p>
          <div className={styles.emptyActions}>{needle ? <button type="button" className={styles.secondary} onClick={() => setQuery("")}>Clear search<X size={13} /></button> : activeFilter ? <Link className={styles.secondary} href={href()}>View all history<ArrowRight size={14} /></Link> : <><Link className={styles.primary} href="/app/prices">Compare prices<ArrowRight size={15} /></Link><Link className={styles.secondary} href="/app/search">Find a route<ChevronRight size={14} /></Link></>}</div>
        </div>}
        <footer className={styles.recordsFoot}><ShieldCheck size={13} /><span>New payments and beneficiaries are currently unavailable. Existing records remain accessible.</span></footer>
      </section>

      <aside className={styles.aside} aria-label="About your history">
        <section className={styles.guide}><h2><History size={16} />How history works</h2><ol>
          <li><span>1</span><div><h3>Choose an environment</h3><p>Keep sandbox runs separate from real payment activity.</p></div></li>
          <li><span>2</span><div><h3>Find a record</h3><p>Filter by status, then search the records loaded in this view.</p></div></li>
          <li><span>3</span><div><h3>Follow the full trail</h3><p>Open a payment for provider attempts, policy checks and status updates.</p></div></li>
        </ol></section>
        <section className={styles.contextCard}><span className={styles.contextIcon}>{mode === "test" ? <FlaskConical size={18} /> : <ShieldCheck size={18} />}</span><div><h2>{mode === "test" ? "Test outcomes, explained" : "A clear separation"}</h2><p>{mode === "test" ? "A test payment can simulate success, failure or a return. These are test results, not production performance." : "Live history shows production records. It does not enable a new payment or change your account access."}</p>
          {mode === "test" && <details className={styles.testDetails}><summary>View test scenarios<ChevronRight size={12} /></summary><dl><div><dt>.13</dt><dd>Insufficient funds</dd></div><div><dt>.66</dt><dd>Compliance rejection</dd></div><div><dt>.55</dt><dd>Awaiting funds</dd></div><div><dt>.77</dt><dd>Returned</dd></div><div><dt>.99</dt><dd>Outcome initially unknown</dd></div></dl><small>For Railor’s simulator, the amount’s cents select an outcome. A provider sandbox follows that provider’s rules.</small></details>}
        </div></section>
      </aside>
    </div>
  </div>;
}
