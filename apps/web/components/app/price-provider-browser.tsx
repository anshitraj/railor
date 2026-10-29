"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Clock3, FileSearch, Info, Search, ShieldCheck, X } from "lucide-react";
import type { PriceRow } from "@railor/core";
import { ProviderLogo } from "./provider-logo";
import { priceSourceTime } from "../../lib/connection-navigation";
import styles from "./price-check.module.css";

const labels = { exact: "Your account", live_public: "Public reference", published: "Published estimate", market_estimate: "Market estimate" };
function money(value: number | null) { return value === null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
type DetailTab = "Details" | "Requirements" | "Source" | "Notes";
function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
  const index = tabs.findIndex((button) => button === document.activeElement);
  if (index < 0) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
}
type Props = {
  rows: PriceRow[]; selected: PriceRow | null; best: PriceRow | null; onSelect: (slug: string) => void;
  from: string; to: string; amount: number; loading: boolean; checked: string;
  flashes: Record<string, "up" | "down">; market: ReactNode; history: ReactNode; coverage: ReactNode;
  webEvidence: ReactNode; connection: ReactNode; action: { label: string; href?: string; external?: boolean };
};

/** Presentation only. Backend ordering, quote eligibility and the converter's selection stay authoritative. */
export function PriceProviderBrowser(props: Props) {
  const { rows, selected, best, from, to, amount, flashes, onSelect } = props;
  const [tab, setTab] = useState("Providers");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [all, setAll] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => setAll(false), [query, sort, from, to]);
  const filtered = useMemo(() => {
    const list = rows.filter((row) => `${row.providerName} ${row.providerSlug}`.toLowerCase().includes(query.trim().toLowerCase()));
    if (sort === "receive") list.sort((a, b) => (b.recipientAmount ?? -Infinity) - (a.recipientAmount ?? -Infinity));
    if (sort === "cost") list.sort((a, b) => (a.totalCostPct ?? Infinity) - (b.totalCostPct ?? Infinity));
    if (sort === "name") list.sort((a, b) => a.providerName.localeCompare(b.providerName));
    return list;
  }, [rows, query, sort]);
  const shown = all ? filtered : filtered.slice(0, 5);
  function choose(slug: string) {
    onSelect(slug);
    requestAnimationFrame(() => {
      const panel = document.getElementById("price-selected-provider");
      if (panel && getComputedStyle(panel).position === "static") {
        panel.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
        panel.focus({ preventScroll: true });
      }
    });
  }
  return <>
    <section className={styles.providers} aria-label="Provider comparison">
      <div className={styles.browserTabs} role="tablist" aria-label="Pricing view" onKeyDown={tabKeys}>{["Providers", "Market view", "Historical data"].map((label, index) => <button type="button" role="tab" tabIndex={tab === label ? 0 : -1} id={`price-tab-${index}`} aria-controls={`price-panel-${index}`} aria-selected={tab === label} key={label} onClick={() => setTab(label)}>{label}{index === 0 && <span>{rows.length}</span>}</button>)}</div>
      <div id="price-panel-0" role="tabpanel" aria-labelledby="price-tab-0" hidden={tab !== "Providers"}>
        <div className={styles.tableTools}><label className={styles.providerSearch}><Search size={14} /><input aria-label="Search providers" placeholder="Search providers" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear provider search" onClick={() => setQuery("")}><X size={13} /></button>}</label><label className={styles.sort}>Sort by<select aria-label="Sort providers" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="receive">Highest recipient amount</option><option value="cost">Lowest total cost</option><option value="name">Provider name</option></select></label></div>
        <div className={styles.tableHeader} aria-hidden><span>Provider</span><span>Recipient gets</span><span>Known fee</span><span>Source</span></div>
        <ol className={styles.providerRows} aria-label="Provider prices" aria-busy={props.loading}>
          {shown.map((row) => <motion.li layout={reduce ? false : "position"} initial={false} transition={{ duration: reduce ? 0 : .18 }} key={row.providerSlug}>
            <button type="button" className={styles.providerRow} aria-pressed={row.providerSlug === selected?.providerSlug} aria-label={`Select ${row.providerName}`} onClick={() => choose(row.providerSlug)}>
              {row.providerSlug === selected?.providerSlug && <motion.span layoutId="price-provider-selection" className={styles.selection} transition={{ duration: reduce ? 0 : .18 }} />}
              <span className={styles.providerName}><ProviderLogo slug={row.providerSlug} name={row.providerName} src={row.logoUrl} size={29} /><span><strong>{row.providerName}</strong>{row.providerSlug === best?.providerSlug && <small>Lowest documented</small>}</span></span>
              <span className={styles.rowAmount}><motion.strong key={`${row.providerSlug}:${row.recipientAmount}`} initial={reduce ? false : { opacity: .5, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : .2 }} data-move={flashes[row.providerSlug]}>{money(row.recipientAmount)} <small>{to}</small></motion.strong>{row.partial && <small className={styles.partial}>Reference · missing costs or eligibility</small>}</span>
              <span className={styles.rowFee}><strong>{row.feeAmount === null ? "Not confirmed" : `${money(row.feeAmount)} ${row.feeCurrency ?? ""}`}</strong>{row.totalCostPct !== null && <small>{row.totalCostPct.toFixed(2)}% all-in</small>}</span>
              <span className={styles.rowSource}><i data-basis={row.basis} />{labels[row.basis]}</span>
            </button>
          </motion.li>)}
        </ol>
        {!shown.length && <div className={styles.empty}><FileSearch size={22} /><strong>{query ? "No providers match your search" : props.loading ? "Checking provider prices…" : "No provider price for this setup yet"}</strong><p>{query ? "Try another name or clear your search." : "Try another currency pair, or review broader coverage in Market view."}</p>{query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}</div>}
        <div className={styles.tableFooter}><span>{shown.length} of {filtered.length} providers{query ? " matching your search" : ""}</span>{filtered.length > 5 && <button type="button" aria-expanded={all} onClick={() => setAll((value) => !value)}>{all ? "Show fewer providers" : "Show all providers"}<ChevronDown size={14} className={all ? styles.rotated : undefined} /></button>}</div>
        <p className={styles.tableNote}>Estimates and incomplete references keep their labels. Sorting does not change which routes are verified.</p>
      </div>
      <motion.div id="price-panel-1" role="tabpanel" aria-labelledby="price-tab-1" hidden={tab !== "Market view"} initial={false} animate={{ opacity: tab === "Market view" ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }} className={styles.contextPanel}><h2>More context for this market</h2><p>Consumer estimates and currency coverage are separate from your current provider prices. They do not confirm your route or account eligibility.</p>{props.market}{props.coverage}</motion.div>
      <motion.div id="price-panel-2" role="tabpanel" aria-labelledby="price-tab-2" hidden={tab !== "Historical data"} initial={false} animate={{ opacity: tab === "Historical data" ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }} className={styles.contextPanel}><h2>Historical pricing context</h2><p>Original amounts, dates and sources are preserved. These samples are never used as current quotes.</p>{props.history}</motion.div>
    </section>
    <SelectedProvider row={selected} from={from} to={to} amount={amount} checked={props.checked} webEvidence={props.webEvidence} connection={props.connection} action={props.action} />
  </>;
}

function SelectedProvider({ row, from, to, amount, checked, webEvidence, connection, action }: { row: PriceRow | null; from: string; to: string; amount: number; checked: string; webEvidence: ReactNode; connection: ReactNode; action: Props["action"] }) {
  const [tab, setTab] = useState<DetailTab>("Details");
  const reduce = useReducedMotion();
  useEffect(() => setTab("Details"), [row?.providerSlug]);
  if (!row) return <aside id="price-selected-provider" tabIndex={-1} className={styles.selectedPanel} aria-label="Selected provider"><div className={styles.empty}><FileSearch size={24} /><strong>Select a provider to explore its price</strong><p>Fees, eligibility and source evidence will appear here.</p></div></aside>;
  const assessment = row.profileAssessment;
  return <aside id="price-selected-provider" tabIndex={-1} className={styles.selectedPanel} aria-label="Selected provider">
    <div className={styles.selectedIdentity}><ProviderLogo slug={row.providerSlug} name={row.providerName} src={row.logoUrl} loading="eager" size={42} /><div><h2>{row.providerName}</h2><p>{from} <ArrowRight size={10} /> {to}{row.side === "payer" ? " · Sender’s service" : ""}</p></div><span className={styles.basisBadge} data-basis={row.basis}>{labels[row.basis]}</span></div>
    <div className={styles.selectedMetrics}><div><span>{row.partial ? "Reference amount" : "Recipient gets (est.)"}</span><motion.strong key={`${row.providerSlug}:${row.recipientAmount}`} initial={reduce ? false : { opacity: .6 }} animate={{ opacity: 1 }} transition={{ duration: .2 }}>{money(row.recipientAmount)} <small>{to}</small></motion.strong></div><div><span>{row.totalCostPct !== null ? "All-in vs mid-market" : "Known provider fee"}</span><strong>{row.totalCostPct !== null ? `${row.totalCostPct.toFixed(2)}%` : row.feeAmount === null ? "—" : money(row.feeAmount)}{row.totalCostPct === null && row.feeAmount !== null && <small> {row.feeCurrency}</small>}</strong></div></div>
    <div className={styles.selectedMeta}><span><Clock3 size={14} />{row.delivery ?? "Delivery unconfirmed"}</span><span><ShieldCheck size={14} />{assessment?.status === "documented" ? "Documented profile" : "Confirm eligibility"}</span></div>
    {row.partial && <p className={styles.warning}><Info size={14} />Some costs or account requirements are unconfirmed. This is not a complete executable quote.</p>}
    {action.href ? <Link prefetch={false} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noreferrer noopener" : undefined} className={styles.providerAction}>{action.label}{action.external ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}</Link> : <p className={styles.noAction}>{action.label}</p>}
    {connection}
    <div className={styles.detailTabs} role="tablist" aria-label="Selected provider information" onKeyDown={tabKeys}>{(["Details", "Requirements", "Source", "Notes"] as const).map((label) => <button key={label} type="button" role="tab" tabIndex={tab === label ? 0 : -1} id={`provider-tab-${label}`} aria-controls="provider-detail-content" aria-selected={tab === label} onClick={() => setTab(label)}>{label}</button>)}</div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={`${row.providerSlug}:${tab}`} id="provider-detail-content" role="tabpanel" aria-labelledby={`provider-tab-${tab}`} className={styles.detailContent} initial={reduce ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .14 }}>
      {tab === "Details" && <><dl className={styles.factList}>{[
        ["Send amount", `${money(amount)} ${from}`], [row.partial ? "Reference receive amount" : "Receive amount (est.)", `${money(row.recipientAmount)} ${to}`], ["Known provider fee", row.feeAmount === null ? "Not supplied" : `${money(row.feeAmount)} ${row.feeCurrency ?? ""}`], ["Exchange rate", row.rate === null ? "Not supplied" : `1 ${from} ≈ ${row.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${to}`], ["Delivery estimate", row.delivery ?? "Not confirmed"], ...(row.shortfall ? [["Compared with lowest documented", `${money(Math.abs(row.shortfall))} ${to} ${row.shortfall > 0 ? "less" : "more"}`]] : []), ["Pricing source", labels[row.basis]], ["Source time", priceSourceTime(row.observedAt, row.basis)], ...(row.expiresAt ? [["Quote valid until", row.expiresAt]] : []), ["Panel checked", checked],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className={styles.detailNote}>Account approval, actual fees and payout availability must be confirmed before sending.</p></>}
      {tab === "Requirements" && <>{assessment ? <><p className={styles.detailIntro}>{assessment.reasons.join(" ")}</p><dl className={styles.requirements}>{[{ label: "KYC / KYB", value: assessment.verification.join(" ") }, { label: "Expected fees", value: assessment.fees }, { label: "Transfer limits", value: assessment.limits }, { label: "Available corridors", value: assessment.corridors }, { label: "Settlement methods", value: assessment.settlement.join(" ") }, { label: "Documents", value: assessment.documents.join(" ") }, { label: "Payment purpose", value: assessment.purpose }].map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>{assessment.sources.map((source) => <a className={styles.sourceLink} key={source.url} href={source.url} target="_blank" rel="noreferrer noopener">{source.label} <ArrowUpRight size={11} /></a>)}<p className={styles.detailNote}>Rules reviewed {assessment.reviewedAt ?? "date unavailable"}. A documented profile is not confirmation that you passed verification.</p></> : <p className={styles.detailIntro}>Account-specific requirements are not confirmed for this price. Ask the provider to verify eligibility.</p>}</>}
      {tab === "Source" && <><span className={styles.basisBadge} data-basis={row.basis}>{labels[row.basis]}</span><p className={styles.detailIntro}>{priceSourceTime(row.observedAt, row.basis)}</p>{row.source.url ? <a className={styles.sourceLink} href={row.source.url} target="_blank" rel="noreferrer noopener">{row.source.label}<ArrowUpRight size={12} /></a> : <p>{row.source.label}</p>}{webEvidence}</>}
      {tab === "Notes" && <>{row.side === "payer" && <p className={styles.detailIntro}>This is a service your sender pays. You only need your bank account; you do not sign up for their sending service.</p>}{row.notes.length ? row.notes.map((note, index) => <p className={styles.detailIntro} key={index}>{note}</p>) : <p className={styles.detailIntro}>No additional provider notes were supplied.</p>}</>}
    </motion.div></AnimatePresence>
  </aside>;
}
