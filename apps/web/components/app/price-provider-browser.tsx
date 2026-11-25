"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Clock3, FileBadge, FileSearch, Info, LockKeyhole, Search, ShieldCheck, X } from "lucide-react";
import type { MarketCoverageProvider, PriceRow } from "@railor/core";
import { ProviderLogo } from "./provider-logo";
import { ProviderRequirements } from "./provider-requirements";
import { PriceLoadingMark } from "../price/price-loading-mark";
import { priceSourceTime } from "../../lib/connection-navigation";
import { recommendedPriceRows } from "../../lib/price-recommendations";
import { priceRowKey, pricingSourceLabel } from "../../lib/price-display";
import { benchmarkCost, benchmarkPayoutDifference, formatBenchmarkCost, formatPayoutDifference } from "../../lib/price-cost";
import styles from "./price-check.module.css";

function money(value: number | null) { return value === null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
type DetailTab = "Details" | "Requirements" | "Source" | "Notes";
export type ProviderQuoteAdvice = { message: string; evidence?: Array<{ url: string; title: string; text: string }>; researchPending?: boolean };
function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
  const index = tabs.findIndex((button) => button === document.activeElement);
  if (index < 0) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
}
type Props = {
  rows: PriceRow[]; selected: PriceRow | null; best: PriceRow | null; onSelect: (slug: string, rowKey?: string) => void;
  candidates?: MarketCoverageProvider[]; selectedCandidate?: MarketCoverageProvider | null;
  bookmark?: ReactNode;
  onGetQuote?: (slug: string, signal: AbortSignal) => Promise<ProviderQuoteAdvice | null>;
  from: string; to: string; amount: number; loading: boolean; checked: string;
  /** The mid-market benchmark every cost is measured against. */
  reference?: { rate: number; source: string; observedAt: string } | null;
  flashes: Record<string, "up" | "down">; market: ReactNode; history: ReactNode; coverage: ReactNode;
  webEvidence: ReactNode; connection: ReactNode; action: { label: string; href?: string; external?: boolean; disabled?: boolean };
};

/** Presentation only. Backend ordering, quote eligibility and the converter's selection stay authoritative. */
export function PriceProviderBrowser(props: Props) {
  const { rows, selected, best, from, to, amount, flashes, onSelect } = props;
  const [tab, setTab] = useState("Providers");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [showResearch, setShowResearch] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [query, sort, from, to, showResearch]);
  const filtered = useMemo(() => {
    const priced = new Set(rows.map((row) => row.providerSlug));
    const ordered = sort === "recommended" ? recommendedPriceRows(rows, best) : rows;
    const entries = [...ordered.map((quote) => ({ providerSlug: quote.providerSlug, providerName: quote.providerName, quote, candidate: undefined as MarketCoverageProvider | undefined })), ...(props.candidates ?? []).filter((candidate) => !priced.has(candidate.providerSlug)).map((candidate) => ({ providerSlug: candidate.providerSlug, providerName: candidate.providerName, quote: undefined as PriceRow | undefined, candidate }))];
    const term = query.trim().toLowerCase();
    const list = entries.filter(entry => (term || showResearch || entry.quote?.recipientAmount != null)
      && `${entry.providerName} ${entry.providerSlug}`.toLowerCase().includes(term));
    if (sort === "receive") list.sort((a, b) => (b.quote?.recipientAmount ?? -Infinity) - (a.quote?.recipientAmount ?? -Infinity));
    if (sort === "cost") list.sort((a, b) => (a.quote?.totalCostPct ?? Infinity) - (b.quote?.totalCostPct ?? Infinity));
    if (sort === "name") list.sort((a, b) => a.providerName.localeCompare(b.providerName));
    return list;
  }, [rows, best, props.candidates, query, sort, showResearch]);
  const priceCount = filtered.filter(({ quote }) => quote?.recipientAmount != null).length;
  function choose(slug: string, rowKey?: string) {
    onSelect(slug, rowKey);
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
      <div className={styles.browserTabs} role="tablist" aria-label="Pricing view" onKeyDown={tabKeys}>{["Providers", "Market view", "Historical data"].map((label, index) => <button type="button" role="tab" tabIndex={tab === label ? 0 : -1} id={`price-tab-${index}`} aria-controls={`price-panel-${index}`} aria-selected={tab === label} key={label} onClick={() => setTab(label)}>{index === 0 ? "Prices" : label}{index === 0 && <span>{rows.filter(row => row.recipientAmount != null).length}</span>}</button>)}</div>
      <div id="price-panel-0" role="tabpanel" aria-labelledby="price-tab-0" hidden={tab !== "Providers"}>
        <div className={styles.tableTools}><label className={styles.providerSearch}><Search size={14} /><input aria-label="Search providers" placeholder="Search providers" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear provider search" onClick={() => setQuery("")}><X size={13} /></button>}</label><label className={styles.sort}>Sort by<select aria-label="Sort providers" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="receive">Highest recipient amount</option><option value="cost">Lowest total cost</option><option value="name">Provider name</option></select></label></div>
        <div className={styles.tableHeader} aria-hidden><span>Provider</span><span>Recipient gets</span><span>Fee · cost vs mid-market</span><span>Data status</span></div>
        <ol id="price-provider-list" ref={listRef} className={styles.providerRows} tabIndex={filtered.length > 5 ? 0 : undefined} aria-label="Provider prices" aria-busy={props.loading}>
          {filtered.map((entry) => <li key={entry.quote ? priceRowKey(entry.quote) : entry.providerSlug}>
            <button type="button" className={styles.providerRow} data-quoted-fee={entry.quote?.feeAmount != null} aria-pressed={entry.quote ? entry.quote === selected : entry.providerSlug === props.selectedCandidate?.providerSlug} aria-label={`Select ${entry.providerName}`} onClick={() => choose(entry.providerSlug, entry.quote ? priceRowKey(entry.quote) : undefined)}>
              {(entry.quote ? entry.quote === selected : entry.providerSlug === props.selectedCandidate?.providerSlug) && <motion.span layoutId="price-provider-selection" className={styles.selection} transition={{ duration: reduce ? 0 : .18 }} />}
              <span className={styles.providerName}><ProviderLogo slug={entry.providerSlug} name={entry.providerName} src={entry.quote?.logoUrl} size={29} /><span><strong>{entry.providerName}</strong>{(() => { const label = entry.quote?.product?.label.replace(`${entry.providerName.split(" · ")[0]} · `, ""); const flat = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ""); return label && !flat(entry.providerName).includes(flat(label)) && !flat(label).includes(flat(entry.providerName)) ? <em className={styles.productLabel} title={label}>{label}</em> : null; })()}{entry.quote && entry.quote === best ? <small title={entry.quote?.basis === "exact" ? "Best account quote among comparable options" : "Highest estimated INR among comparable options"}>{entry.quote?.basis === "exact" ? "Best account quote" : `Highest estimated ${to}`}</small> : entry.quote?.partial && entry.quote.basis === "published" && entry.quote.profileAssessment?.priceApplicable && entry.quote.recipientAmount !== null && best?.recipientAmount != null && entry.quote.recipientAmount > best.recipientAmount && <small>Potentially cheaper · confirm total</small>}</span></span>
              <span className={styles.rowAmount}><motion.strong key={`${entry.providerSlug}:${entry.quote?.recipientAmount}`} initial={reduce ? false : { opacity: .5, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : .2 }} data-move={entry.quote ? flashes[priceRowKey(entry.quote)] : undefined}>{entry.quote?.recipientAmount != null ? money(entry.quote.recipientAmount) : "No payout quote"}{entry.quote?.recipientAmount != null && <small> {to}</small>}</motion.strong>{entry.quote?.publicOffer ? <small className={styles.partial}>First transfer · bank-funded</small> : entry.quote?.missing?.length ? <small className={styles.partial} title={entry.quote.missing.join(" ")}>Missing: {entry.quote.missing[0]}</small> : entry.quote?.partial ? <small className={styles.partial}>{entry.quote.costComplete ? "Confirm eligibility" : "Partial · a cost is unknown"}</small> : entry.quote?.publicComparison ? <small className={styles.partial}>{entry.quote.publicComparison.sourceCountry ?? "Origin not supplied"} → {entry.quote.publicComparison.destinationCountry ?? to} · last 24h</small> : !entry.quote && <small className={styles.partial} title={entry.candidate?.pricingStatus?.reason}>{entry.candidate?.pricingStatus?.label ?? (entry.candidate?.currencyMatch === "unverified" ? "Check route availability" : "Provider sets your price")}</small>}</span>
              <span className={styles.rowFee}><strong title={entry.candidate?.feeHighlight}>{entry.quote?.feeAmount == null ? entry.candidate?.feeHighlight ?? (entry.quote?.feeBreakdown || entry.candidate?.feeEvidence?.length ? "Fee details available" : "Research details") : `${money(entry.quote.feeAmount)} ${entry.quote.feeCurrency ?? ""}`}</strong>{entry.quote ? (() => {
                const cost = benchmarkCost(entry.quote, amount, props.reference?.rate, to);
                const difference = benchmarkPayoutDifference(entry.quote.recipientAmount, amount, props.reference?.rate, to);
                return <small>{cost.kind === "cost" ? `Cost ${formatBenchmarkCost(cost, "percent")}` : difference.kind === "cost" ? formatPayoutDifference(difference) : "No mid-market comparison"}</small>;
              })() : null}</span>
              <span className={styles.rowSource}><i data-basis={entry.quote?.basis ?? "unavailable"} />{entry.quote ? pricingSourceLabel(entry.quote) : entry.candidate?.pricingReviewedAt ? "Public research" : "Provider pricing"}</span>
            </button>
          </li>)}
        </ol>
        {!filtered.length && <div className={styles.empty}>{props.loading && !query ? <><PriceLoadingMark /><strong role="status">Checking provider prices…</strong></> : <><FileSearch size={22} /><strong>{query ? "No providers match your search" : "No provider price for this setup yet"}</strong><p>{query ? "Try another name or clear your search." : "Try another currency pair, or review broader coverage in Market view."}</p>{query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}</>}</div>}
        <div className={styles.tableFooter}>
          <span>{priceCount} {priceCount === 1 ? "price" : "prices"}</span>
          {!query.trim() && Boolean(props.candidates?.length || rows.some(row => row.recipientAmount === null)) && (
            <button type="button" className={styles.scrollHint} aria-expanded={showResearch} aria-controls="price-provider-list" onClick={() => setShowResearch(value => !value)}>
              {showResearch ? "Show prices only" : "Browse more providers"} <ChevronDown size={14} aria-hidden />
            </button>
          )}
        </div>
        <p className={styles.tableNote}>Complete estimates first; public comparisons keep their collection time and conditions. <Link href="/docs/pricing">How comparison works <ArrowUpRight size={10} /></Link></p>
      </div>
      <motion.div id="price-panel-1" role="tabpanel" aria-labelledby="price-tab-1" hidden={tab !== "Market view"} initial={false} animate={{ opacity: tab === "Market view" ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }} className={styles.contextPanel}><h2>More context for this market</h2><p>Consumer estimates and currency coverage are separate from your current provider prices. They do not confirm your route or account eligibility.</p>{props.market}{props.coverage}</motion.div>
      <motion.div id="price-panel-2" role="tabpanel" aria-labelledby="price-tab-2" hidden={tab !== "Historical data"} initial={false} animate={{ opacity: tab === "Historical data" ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }} className={styles.contextPanel}>{tab === "Historical data" ? props.history : null}</motion.div>
    </section>
    {props.selectedCandidate ? <UnpricedProvider key={props.selectedCandidate.providerSlug} provider={props.selectedCandidate} onGetQuote={props.onGetQuote} bookmark={props.bookmark} /> : <SelectedProvider key={selected ? priceRowKey(selected) : "none"} row={selected} best={best} reference={props.reference ?? null} from={from} to={to} amount={amount} checked={props.checked} webEvidence={props.webEvidence} connection={props.connection} action={props.action} bookmark={props.bookmark} />}
  </>;
}

function UnpricedProvider({ provider, onGetQuote, bookmark }: { provider: MarketCoverageProvider; onGetQuote?: Props["onGetQuote"]; bookmark?: ReactNode }) {
  const [pending, setPending] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<NonNullable<Props["onGetQuote"]>>>>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function getQuote() {
    if (!onGetQuote || pending) return;
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    setDetail(null);
    try {
      const detail = await onGetQuote(provider.providerSlug, request.signal);
      if (!request.signal.aborted && detail) setDetail(detail);
    } catch {
      if (!request.signal.aborted) setDetail({ message: "The quote check didn’t finish. Try again shortly." });
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }

  const fees = provider.feeEvidence?.slice(0, 3) ?? [];
  const sources = provider.discoverySources?.filter(source => !fees.some(fee => fee.sourceUrl === source.url));
  return <aside id="price-selected-provider" tabIndex={-1} className={styles.selectedPanel} aria-label="Selected provider">
    <div className={styles.selectedHeader}><ProviderLogo slug={provider.providerSlug} name={provider.providerName} size={39} /><div><h2>{provider.providerName}</h2><p>{provider.category}</p></div></div>
    {bookmark && <div className={styles.researchBookmark}>{bookmark}</div>}
    <div className={styles.pricingResearch}>
      <span>No payout quote for this setup</span>
      <h3>{provider.pricingStatus?.label ?? "Provider pricing"}</h3>
      <p>{provider.pricingStatus?.reason ?? "Ask the provider for your route and account price."}</p>
      {provider.pricingReviewedAt && <small>Reviewed <time dateTime={provider.pricingReviewedAt}>{provider.pricingReviewedAt}</time></small>}
    </div>
    {onGetQuote ? <div className={styles.providerQuoteRequest}>
      <button type="button" className={styles.providerAction} onClick={() => void getQuote()} disabled={pending} aria-busy={pending}>
        {pending ? "Checking the provider…" : "Get quote"}{pending ? <Clock3 size={14} aria-hidden /> : <ArrowRight size={14} aria-hidden />}
      </button>
      <p role="status">{detail?.message ?? (pending ? "Checking the provider’s prices for this route. Allow about 30 seconds." : "Checks the provider for this route. Allow about 30 seconds.")}</p>
      {detail?.evidence?.map(item => <div key={`${item.url}:${item.text}`} className={styles.publishedFee}>
        <p>{item.text}</p><a className={styles.sourceLink} href={item.url} target="_blank" rel="noreferrer noopener">{item.title}<ArrowUpRight size={12} /></a>
      </div>)}
      {detail?.researchPending ? <p>Official-source research is still running. Check again shortly.</p> : null}
    </div> : null}
    {provider.websiteUrl
      ? <a className={styles.providerAction} href={provider.websiteUrl} target="_blank" rel="noreferrer noopener">Visit {provider.providerName}<ArrowUpRight size={14} /></a>
      : <p className={styles.noAction}>{provider.providerName} doesn’t publish a price for this route. Ask the provider for a quote.</p>}
    {fees.map((fee, index) => <div className={styles.publishedFee} key={index}><h3>{index === 0 && provider.feeHighlight ? provider.feeHighlight : fee.product}</h3><p>{fee.summary}</p>{fee.sourceUrl && <a href={fee.sourceUrl} className={styles.sourceLink} target="_blank" rel="noreferrer noopener">Fee source <ArrowUpRight size={11} aria-hidden /></a>}</div>)}
    {sources?.map(source => <a key={source.url} className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer noopener">{source.label}<ArrowUpRight size={12} /></a>)}
    {provider.profileAssessment && <details className={styles.unpricedRequirements}>
      <summary>Requirements and remittance proof</summary>
      <ProviderRequirements assessment={provider.profileAssessment} />
    </details>}
    <Link href="/docs/pricing#provider-coverage" className={styles.sourceLink}>Coverage and pricing methodology<ArrowRight size={12} /></Link>
  </aside>;
}

const METHOD_NAME: Record<string, string> = { local_bank: "Local bank transfer", wire: "International wire", card: "Card", transfer_service: "Transfer app" };

function SelectedProvider({ row, best, reference, from, to, amount, checked, webEvidence, connection, action, bookmark }: { row: PriceRow | null; best: PriceRow | null; reference: { rate: number; source: string; observedAt: string } | null; from: string; to: string; amount: number; checked: string; webEvidence: ReactNode; connection: ReactNode; action: Props["action"]; bookmark?: ReactNode }) {
  // The provider's tab and bookmark stay focused while their quote refreshes.
  const [tab, setTab] = useState<DetailTab>("Details");
  const reduce = useReducedMotion();
  if (!row) return <aside id="price-selected-provider" tabIndex={-1} className={styles.selectedPanel} aria-label="Selected provider"><div className={styles.empty}><FileSearch size={24} /><strong>Select a provider to explore its price</strong><p>Fees, eligibility and source evidence will appear here.</p></div></aside>;
  const assessment = row.profileAssessment;
  const payment = assessment?.payment;
  const feeTax = payment?.feeTax?.detail ?? row.taxNote ?? (row.taxIncluded === true
    ? "Included in the published provider fee."
    : row.taxIncluded === false
      ? "Added to the base fee and included in the displayed estimate."
      : row.taxIncluded === null ? "Not stated in the sources checked." : "No verified tax treatment for this payment method.");
  const receipt = payment?.receipt?.detail ?? row.receipt;
  const delivery = row.basis === "exact" && row.delivery !== payment?.delivery?.label ? row.delivery : payment?.delivery?.detail ?? row.delivery;
  const cost = benchmarkCost(row, amount, reference?.rate, to);
  const difference = benchmarkPayoutDifference(row.recipientAmount, amount, reference?.rate, to);
  const isBest = best === row;
  const benchmark = reference ? `${reference.source}, 1 ${from} = ${reference.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${to}, observed ${new Date(reference.observedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC. A mid-market rate, not a consumer offer.` : "No benchmark rate available.";
  return <aside id="price-selected-provider" tabIndex={-1} className={styles.selectedPanel} aria-label="Selected provider">
    <div className={styles.selectedIdentity}><ProviderLogo slug={row.providerSlug} name={row.providerName} src={row.logoUrl} loading="eager" size={42} /><div><h2>{row.providerName}</h2><p>{row.product?.label ?? <>{from} <ArrowRight size={10} /> {to}</>}</p></div><span className={styles.basisBadge} data-basis={row.basis}>{pricingSourceLabel(row)}</span></div>
    <div className={styles.selectedMetrics}><div><span>{row.partial ? "Reference amount" : "Recipient gets (est.)"}</span><motion.strong key={`${row.providerSlug}:${row.recipientAmount}`} initial={reduce ? false : { opacity: .6 }} animate={{ opacity: 1 }} transition={{ duration: .2 }}>{money(row.recipientAmount)} <small>{to}</small></motion.strong></div><div><span>{cost.kind === "cost" ? "Cost vs mid-market" : "Payout vs mid-market"}</span><strong>{cost.kind === "cost" ? formatBenchmarkCost(cost, "percent") : difference.kind === "cost" ? formatPayoutDifference(difference) : "No benchmark"}</strong></div></div>
    {isBest ? <p className={styles.rankNote}>{row.basis === "exact" ? `Best account quote among comparable options${row.expiresAt ? `, valid until ${new Date(row.expiresAt).toLocaleTimeString("en-GB", { timeStyle: "short" })}` : ""}.` : `Highest estimated ${to} among comparable options.`}</p> : null}
    {cost.kind === "gap" ? <p className={styles.gapNote}><Info size={14} />{cost.reason}</p> : null}
    <div className={styles.selectedMeta}><span><Clock3 size={14} aria-hidden />{row.delivery ?? "Ask provider about delivery"}</span>{payment?.receipt && <span className={styles.receiptChip}><FileBadge size={14} aria-hidden />{payment.receipt.label}</span>}<span><ShieldCheck size={14} aria-hidden />{assessment?.status === "documented" ? "Documented profile" : "Confirm eligibility"}</span></div>
    {row.partial && <p className={styles.warning}><Info size={14} />{row.publicOffer ? `First-transfer offer for ${row.publicOffer.fundingMethod} → ${row.publicOffer.payoutMethod}. Subject to provider eligibility. Collected ${priceSourceTime(row.observedAt, row.basis).replace(/^Collected /, "")}; not a locked quote.` : row.costComplete && !row.missing?.length ? row.profileAssessment?.reasons[0] ?? "Confirm account eligibility and the final price with the provider." : "Some costs or account requirements are unconfirmed. This is not a complete executable quote."}</p>}
    {row.publicComparison && <p className={styles.detailIntro}>Public price observed for {row.publicComparison.sourceCountry ?? "an unspecified sender country"} → {row.publicComparison.destinationCountry ?? to}. Funding method and first-transfer offers may change your price. This reference is excluded from the complete-quote winner.</p>}
    <div className={styles.selectedActions}>
      {action.href && !action.disabled ? <Link prefetch={false} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noreferrer noopener" : undefined} className={styles.providerAction}>{action.label}{action.external ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}</Link> : <button type="button" disabled className={styles.providerAction}><LockKeyhole size={14} />{action.label}</button>}
      {bookmark}
    </div>
    {connection}
    <div className={styles.detailTabs} role="tablist" aria-label="Selected provider information" onKeyDown={tabKeys}>{(["Details", "Requirements", "Source", "Notes"] as const).map((label) => <button key={label} type="button" role="tab" tabIndex={tab === label ? 0 : -1} id={`provider-tab-${label}`} aria-controls="provider-detail-content" aria-selected={tab === label} onClick={() => setTab(label)}>{label}</button>)}</div>
    {/* No exit animation: an outgoing panel must never show the previous provider's figures. */}
    <div key={tab} id="provider-detail-content" role="tabpanel" aria-labelledby={`provider-tab-${tab}`} className={tab === "Requirements" ? styles.detailContent : `${styles.detailContent} railor-step-in`}>
      {tab === "Details" && <><dl className={styles.factList}>{[
        ["Product", row.product?.label ?? row.providerName], ["Client pays by", row.paymentMethods?.length ? row.paymentMethods.map((method) => METHOD_NAME[method] ?? method).join(", ") : "Unknown"],
        ["Send amount", `${money(amount)} ${from}`], [row.partial ? "Reference receive amount" : "Receive amount (est.)", `${money(row.recipientAmount)} ${to}`], ["Known provider fee", row.feeAmount === null ? (row.feeBreakdown ? "See fee breakdown" : "Confirm at checkout") : `${money(row.feeAmount)} ${row.feeCurrency ?? ""}`], ...(row.feeBreakdown ? [["Fee breakdown", row.feeBreakdown]] : []), ["Who pays the fee", row.side === "payer" ? "Your client (sender)" : row.side === "recipient" ? "You (deducted before payout)" : "Unknown"], ["Tax on provider fees", feeTax], ...(payment?.exportTax ? [["Export GST and income tax", payment.exportTax.detail]] : []), ["Remittance proof", receipt ?? (row.receipt === null ? "Not stated in the sources checked." : "No verified document for this payment method.")], ["Cost vs mid-market", cost.kind === "cost" ? formatBenchmarkCost(cost, "percent") : cost.reason], ["Exchange rate", row.rate === null ? "Not supplied" : `1 ${from} ≈ ${row.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${to}`], ["Delivery estimate", delivery ?? "Ask the provider for timing on this route."], ...(row.shortfall ? [["Compared with lowest documented", `${money(Math.abs(row.shortfall))} ${to} ${row.shortfall > 0 ? "less" : "more"}`]] : []), ["Data status", pricingSourceLabel(row)], ["Source time", priceSourceTime(row.observedAt, row.basis)], ["Benchmark", benchmark], ...(row.missing?.length ? [["Missing", row.missing.join(" ")]] : []), ...(row.expiresAt ? [["Quote valid until", row.expiresAt]] : []), ["Panel checked", checked],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{cost.kind === "cost" && <p className={styles.detailNote}>Shown as <strong>{cost.bps} basis points (bps)</strong>. One basis point is 0.01 percentage points. Railor compares the quoted payout with the amount at the mid-market exchange rate.</p>}</>}
      {tab === "Requirements" && <ProviderRequirements assessment={assessment} feeTax={feeTax} receipt={receipt} delivery={delivery} />}
      {tab === "Source" && <><span className={styles.basisBadge} data-basis={row.basis}>{pricingSourceLabel(row)}</span><p className={styles.detailIntro}>{priceSourceTime(row.observedAt, row.basis)}</p>{row.source.url ? <a className={styles.sourceLink} href={row.source.url} target="_blank" rel="noreferrer noopener">{row.source.label}<ArrowUpRight size={12} /></a> : <p>{row.source.label}</p>}{row.rateSource && <><p className={styles.detailIntro}>Provider FX observed {new Date(row.rateSource.observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</p><a className={styles.sourceLink} href={row.rateSource.url} target="_blank" rel="noreferrer noopener">{row.rateSource.label}<ArrowUpRight size={12} /></a></>}{payment && ([["Delivery timing", payment.delivery], ["Remittance proof", payment.receipt], ["Tax on provider fees", payment.feeTax], ["Export GST and LUT", payment.exportTax]] as const).map(([label, fact]) => fact && <a className={styles.sourceLink} key={label} href={fact.url} target="_blank" rel="noreferrer noopener">{label}<ArrowUpRight size={12} aria-hidden /></a>)}{webEvidence}</>}
      {tab === "Notes" && <>{row.side === "payer" && <p className={styles.detailIntro}>This is a service your sender pays. You only need your bank account; you do not sign up for their sending service.</p>}{row.notes.length ? row.notes.map((note, index) => <p className={styles.detailIntro} key={index}>{note}</p>) : <p className={styles.detailIntro}>No additional provider notes were supplied.</p>}</>}
    </div>
  </aside>;
}
