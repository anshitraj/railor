"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Banknote, ChevronDown, Clock3, CreditCard, FileBadge, FileSearch, Gift, Info, Landmark, Layers3, LockKeyhole, Megaphone, Search, ShieldCheck, Wallet, X, Zap } from "lucide-react";
import type { MarketCoverageProvider, PricePromotions, PriceRow } from "@railor/core";
import { ProviderLogo } from "./provider-logo";
import { ProviderRequirements } from "./provider-requirements";
import { PriceLoadingMark } from "../price/price-loading-mark";
import { priceSourceTime } from "../../lib/connection-navigation";
import { recommendedPriceRows } from "../../lib/price-recommendations";
import { RollingPrice } from "../price/animated-amount";
import { priceRowKey, pricingSourceLabel, providerIdentity } from "../../lib/price-display";
import { benchmarkCost, benchmarkPayoutDifference, formatBenchmarkCost, formatPayoutDifference } from "../../lib/price-cost";
import styles from "./price-check.module.css";

function money(value: number | null) { return value === null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const DETAIL_TABS = ["Overview", "Requirements", "Sources", "Notes"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
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
  /** Provider offers for this corridor: shown beside prices, never folded into them. */
  promotions?: PricePromotions;
};

type Offer = PricePromotions["offers"][number];
const offerEnds = (offer: Offer) => offer.endsAt ? `Ends ${new Date(offer.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : null;

/** Presentation only. Backend ordering, quote eligibility and the converter's selection stay authoritative. */
export function PriceProviderBrowser(props: Props) {
  const reduce = useReducedMotion();
  const { rows, selected, best, from, to, amount, flashes, onSelect } = props;
  const offers = props.promotions?.offers ?? [];
  // Exact slug only: "wise-business" is a different product from "wise" and has its own offers.
  const offerFor = (slug: string) => offers.find((offer) => offer.providerSlug === slug);
  const [tab, setTab] = useState("Providers");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [showResearch, setShowResearch] = useState(false);
  const [promotions, setPromotions] = useState<{ pair: string; rows: { slug: string; endsAt: string }[] }>();
  const pair = `${from}:${to}`;
  useEffect(() => {
    if (from === to) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      let delay = 30_000;
      try {
        const response = await fetch(`/api/prices/promotions?${new URLSearchParams({ from, to })}`, { signal: controller.signal, cache: "no-store" });
        const data: { promotions: { slug: string; endsAt: string }[] } = response.ok ? await response.json() : { promotions: [] };
        if (!controller.signal.aborted) {
          const now = Date.now();
          const active = data.promotions.filter(item => Date.parse(item.endsAt) > now);
          setPromotions({ pair, rows: active });
          delay = Math.max(100, Math.min(delay, ...active.map(item => Date.parse(item.endsAt) - now)));
        }
      } catch {
        if (!controller.signal.aborted) setPromotions({ pair, rows: [] });
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, delay);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [from, to, pair]);

  const activePromotions = useMemo(() => new Set(promotions?.pair === pair
    ? promotions.rows.filter(item => Date.parse(item.endsAt) > Date.now()).map(item => item.slug)
    : []), [pair, promotions]);
  const listRef = useRef<HTMLOListElement>(null);
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
    if (sort === "recommended") list.sort((a, b) =>
      Number(b.quote?.recipientAmount != null && activePromotions.has(providerIdentity(b.providerSlug))) -
      Number(a.quote?.recipientAmount != null && activePromotions.has(providerIdentity(a.providerSlug))));
    return list;
  }, [rows, best, props.candidates, query, sort, showResearch, activePromotions]);
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
    <section className={`${styles.providers} ${styles.compactProviders}`} aria-label="Provider comparison">
      <div className={styles.browserTabs} role="tablist" aria-label="Pricing view" onKeyDown={tabKeys}>{["Providers", "Market view", "Historical data"].map((label, index) => <button type="button" role="tab" tabIndex={tab === label ? 0 : -1} id={`price-tab-${index}`} aria-controls={`price-panel-${index}`} aria-selected={tab === label} key={label} onClick={() => setTab(label)}>{index === 0 ? "Prices" : label}{index === 0 && <span>{rows.filter(row => row.recipientAmount != null).length}</span>}</button>)}</div>
      <div id="price-panel-0" role="tabpanel" aria-labelledby="price-tab-0" hidden={tab !== "Providers"}>
        <div className={styles.tableTools}><label className={styles.providerSearch}><Search size={14} /><input aria-label="Search providers" placeholder="Search providers" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear provider search" onClick={() => setQuery("")}><X size={13} /></button>}</label><label className={styles.sort}>Sort by<select aria-label="Sort providers" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="receive">Highest recipient amount</option><option value="cost">Lowest total cost</option><option value="name">Provider name</option></select></label></div>
        <div className={styles.tableHeader} aria-hidden><span>Provider</span><span>Fee &amp; rate</span><span>Recipient gets</span></div>
        <ol id="price-provider-list" ref={listRef} className={styles.providerRows} tabIndex={filtered.length > 5 ? 0 : undefined} aria-label="Provider prices" aria-busy={props.loading}>
          {filtered.map(({ providerSlug, providerName, quote, candidate }) => {
            const promoted = quote?.recipientAmount != null && activePromotions.has(providerIdentity(providerSlug));
            const current = quote ? quote === selected : providerSlug === props.selectedCandidate?.providerSlug;
            const method = quote ? fundingMethod(quote) : null;
            const MethodIcon = method && /card/i.test(method) ? CreditCard : Landmark;
            const difference = quote ? benchmarkPayoutDifference(quote.recipientAmount, amount, props.reference?.rate, to) : null;
            const cost = quote ? benchmarkCost(quote, amount, props.reference?.rate, to) : null;
            const warning = quote?.missing?.[0] ?? (quote?.partial ? quote.costComplete ? "Confirm eligibility" : "Cost to confirm" : null);
            const source = quote ? pricingSourceLabel(quote) : candidate?.pricingStatus?.label ?? "Check provider";
            const key = quote ? priceRowKey(quote) : providerSlug;
            return <li key={key}>
              <button type="button" className={styles.providerRow} data-promoted={promoted || undefined} aria-pressed={current}
                aria-label={`Select ${providerName}${promoted ? ", promoted" : ""}`} onClick={() => choose(providerSlug, quote ? key : undefined)}>
                {current && <motion.span layoutId="price-provider-selection" className={styles.selection} transition={{ duration: reduce ? 0 : .18 }} />}
                <span className={styles.providerName}>
                  <ProviderLogo slug={providerSlug} name={providerName} src={quote?.logoUrl} size={29} />
                  <span>
                    <strong>{providerName}</strong>
                    {method && <span className={styles.fundingBadge}><MethodIcon size={12} aria-hidden /><span>Pay via {method}</span></span>}
                    {quote?.product?.label && !method && <em className={styles.productLabel}>{quote.product.label}</em>}
                    <span className={styles.quoteRowBadges}>
                      {promoted && <span className={styles.promotedBadge} title="Paid placement"><Megaphone size={11} aria-hidden />Promoted</span>}
                      {(() => { const offer = offerFor(providerSlug); return offer ? <span className={styles.offerChip} title={offer.terms}><Gift size={11} aria-hidden />{offer.headline}</span> : null; })()}
                      {quote && quote === best && <span className={styles.comparableBadge}>Best comparable</span>}
                    </span>
                  </span>
                </span>
                <span className={styles.rowFee}>
                  <strong>{quote?.feeAmount != null ? `${money(quote.feeAmount)} ${quote.feeCurrency ?? ""}` : candidate?.feeHighlight ?? "Check fee"}</strong>
                  {quote?.rate != null && <span className={styles.quoteRowRate}>1 {from} = {quote.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} {to}</span>}
                  {difference?.kind === "cost" && <span className={styles.quoteRowDifference} data-favorable={difference.costMinor < 0 || undefined}>
                    <b title={cost?.kind === "gap" ? "Payout difference. Total cost still needs confirmation." : "Cost compared with mid-market"}>{signedPercent(difference.bps)}</b>
                    <span>{formatPayoutDifference(difference)}</span>
                  </span>}
                </span>
                <span className={styles.rowAmount}>
                  <strong data-move={quote ? flashes[key] : undefined}>{quote?.recipientAmount != null ? <><RollingPrice key={to} value={quote.recipientAmount} /><small> {to}</small></> : "No payout quote"}</strong>
                  {quote?.delivery && <span className={styles.rowSource}><Clock3 size={12} aria-hidden />{quote.delivery}</span>}
                  <span className={styles.rowSource}><i data-basis={quote?.basis ?? "unavailable"} aria-hidden />{source}</span>
                  {warning && <small className={styles.partial} title={warning}>{warning}</small>}
                </span>
              </button>
            </li>;
          })}
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
    {props.selectedCandidate ? <UnpricedProvider key={props.selectedCandidate.providerSlug} provider={props.selectedCandidate} onGetQuote={props.onGetQuote} bookmark={props.bookmark} /> : <SelectedProvider key={selected ? priceRowKey(selected) : "none"} offer={selected ? offerFor(selected.providerSlug) : undefined} row={selected} best={best} reference={props.reference ?? null} from={from} to={to} amount={amount} checked={props.checked} webEvidence={props.webEvidence} connection={props.connection} action={props.action} bookmark={props.bookmark} />}
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
    <div className={styles.quoteHero}>
      <ProviderIdentity slug={provider.providerSlug} name={provider.providerName} subtitle={provider.category} status="Quote unavailable" />
    </div>
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

const METHOD_NAME: Record<string, string> = { local_bank: "Bank transfer", wire: "International wire", card: "Card", transfer_service: "Transfer app" };

function fundingMethod(quote: PriceRow) {
  if (quote.publicOffer?.fundingMethod) return quote.publicOffer.fundingMethod;
  if (quote.fundingLabel) return quote.fundingLabel;
  const methods = quote.paymentMethods?.filter(method => method !== "transfer_service") ?? [];
  const specific = methods.length ? methods : quote.paymentMethods ?? [];
  return specific.map(method => METHOD_NAME[method] ?? method).join(" / ") || null;
}

function signedPercent(bps: number) {
  const sign = bps < 0 ? "−" : bps > 0 ? "+" : "";
  return `${sign}${(Math.abs(bps) / 100).toFixed(2)}%`;
}

function QuoteFacts({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className={styles.factList}>{items.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  ))}</dl>;
}

function ProviderIdentity({ slug, name, logo, subtitle, status, basis, offer }: {
  slug: string; name: string; logo?: string; subtitle: ReactNode; status: string; basis?: PriceRow["basis"]; offer?: boolean;
}) {
  return (
    <header className={styles.selectedIdentity} data-provider={providerIdentity(slug)}>
      <ProviderLogo slug={slug} name={name} src={logo} size={42} loading="eager" />
      <div>
        <h2>{name}</h2>
        <p>{subtitle}</p>
      </div>
      <span className={styles.quoteStatus} data-basis={basis} data-offer={offer || undefined}>
        <Layers3 size={13} aria-hidden />{status}
      </span>
    </header>
  );
}

function SelectedProvider({ row, offer, best, reference, from, to, amount, checked, webEvidence, connection, action, bookmark }: { row: PriceRow | null; offer?: Offer; best: PriceRow | null; reference: { rate: number; source: string; observedAt: string } | null; from: string; to: string; amount: number; checked: string; webEvidence: ReactNode; connection: ReactNode; action: Props["action"]; bookmark?: ReactNode }) {
  const [tab, setTab] = useState<DetailTab>("Overview");
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
  const deliveryLabel = row.delivery ?? payment?.delivery?.label;
  const cost = benchmarkCost(row, amount, reference?.rate, to);
  const difference = benchmarkPayoutDifference(row.recipientAmount, amount, reference?.rate, to);
  const percent = difference.kind === "cost" ? `${(Math.abs(difference.bps) / 100).toFixed(2)}%` : null;
  const receiveLabel = row.partial || row.basis === "market_estimate" ? "Reference amount" : row.basis === "exact" ? "Recipient gets" : "Estimated payout";
  const sourceLabel = pricingSourceLabel(row);
  const sourceTime = priceSourceTime(row.observedAt, row.basis);
  const requirements = <ProviderRequirements assessment={assessment} feeTax={feeTax} receipt={receipt} delivery={delivery} />;
  const sourceDetails = (
    <div className={styles.quoteSources}>
      <QuoteFacts items={[
        ["Data status", sourceLabel],
        ["Source time", sourceTime],
        ["Panel checked", checked],
        ...(row.expiresAt ? [["Quote valid until", row.expiresAt] satisfies [string, string]] : []),
        ["Mid-market source", reference ? <>{reference.source} · {priceSourceTime(reference.observedAt, "reference")}</> : "No benchmark rate available"],
      ]} />
      {row.source.url ? <a className={styles.sourceLink} href={row.source.url} target="_blank" rel="noreferrer noopener">{row.source.label}<ArrowUpRight size={12} aria-hidden /></a> : <p className={styles.detailIntro}>{row.source.label}</p>}
      {row.rateSource && <a className={styles.sourceLink} href={row.rateSource.url} target="_blank" rel="noreferrer noopener">{row.rateSource.label} · {priceSourceTime(row.rateSource.observedAt, "reference")}<ArrowUpRight size={12} aria-hidden /></a>}
      {payment && ([
        ["Delivery timing", payment.delivery], ["Remittance proof", payment.receipt],
        ["Tax on provider fees", payment.feeTax], ["Export GST and LUT", payment.exportTax],
      ] as const).map(([label, fact]) => fact && <a className={styles.sourceLink} key={label} href={fact.url} target="_blank" rel="noreferrer noopener">{label}<ArrowUpRight size={12} aria-hidden /></a>)}
      {webEvidence}
    </div>
  );

  return (
    <aside id="price-selected-provider" tabIndex={-1} className={styles.selectedPanel} aria-label="Selected provider">
      <div className={styles.quoteHero}>
        <ProviderIdentity slug={row.providerSlug} name={row.providerName} logo={row.logoUrl}
          subtitle={row.product?.label ?? <>{from} <ArrowRight size={10} aria-hidden /> {to}</>}
          status={sourceLabel} basis={row.basis} offer={Boolean(row.publicOffer)} />
        <dl className={styles.selectedMetrics}>
          <div>
            <dt>{receiveLabel}</dt>
            <dd>{row.recipientAmount !== null ? <RollingPrice key={to} value={row.recipientAmount} /> : "—"} <small>{to}</small></dd>
          </div>
          <div>
            <dt>{cost.kind === "cost" ? "Total cost" : "Payout vs mid-market"} <Info size={12} aria-hidden /></dt>
            <dd>{cost.kind === "cost" ? formatBenchmarkCost(cost, "percent") : difference.kind === "cost" ? formatPayoutDifference(difference) : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Delivery time</dt>
            <dd><span className={styles.deliverySticker} data-known={Boolean(deliveryLabel) || undefined}>
              {deliveryLabel ? <Zap size={14} aria-hidden /> : <Clock3 size={14} aria-hidden />}
              {deliveryLabel ?? "Ask provider"}
            </span></dd>
          </div>
        </dl>
        <div className={styles.selectedActions}>
          {action.href && !action.disabled
            ? <Link prefetch={false} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noreferrer noopener" : undefined} className={styles.providerAction}>{action.label}{action.external ? <ArrowUpRight size={15} aria-hidden /> : <ArrowRight size={15} aria-hidden />}</Link>
            : <button type="button" disabled className={styles.providerAction}><LockKeyhole size={14} aria-hidden />{action.label}</button>}
          {bookmark}
        </div>
      </div>
      <div className={styles.selectedMeta}>
        {best === row && <span data-tone="accent">{row.basis === "exact" ? "Best account quote" : "Highest comparable payout"}</span>}
        {payment?.receipt && <span data-tone="green"><FileBadge size={14} aria-hidden />{payment.receipt.label}</span>}
        <span><ShieldCheck size={14} aria-hidden />{assessment?.status === "documented" ? "Documented profile" : "Confirm eligibility"}</span>
      </div>
      {row.partial && <p className={styles.warning}><Info size={14} aria-hidden />{
        row.publicOffer ? `First-transfer offer for ${row.publicOffer.fundingMethod} → ${row.publicOffer.payoutMethod}. Subject to provider eligibility. ${sourceTime}.`
          : row.costComplete && !row.missing?.length ? assessment?.reasons[0] ?? "Confirm account eligibility and the final price with the provider."
            : "Some costs or account requirements are unconfirmed."
      }</p>}
      {row.publicComparison && <p className={styles.detailIntro}>Public price observed for {row.publicComparison.sourceCountry ?? "an unspecified sender country"} → {row.publicComparison.destinationCountry ?? to}. Funding method and first-transfer offers may change your price.</p>}
      {connection}
      <div className={styles.detailTabs} role="tablist" aria-label="Selected provider information" onKeyDown={tabKeys}>
        {DETAIL_TABS.map((label) => <button key={label} type="button" role="tab" tabIndex={tab === label ? 0 : -1} id={`provider-tab-${label}`} aria-controls="provider-detail-content" aria-selected={tab === label} onClick={() => setTab(label)}>{label}</button>)}
      </div>
      <div key={tab} id="provider-detail-content" role="tabpanel" aria-labelledby={`provider-tab-${tab}`} className={styles.detailContent}>
        {tab === "Overview" && (
          <>
            <div className={styles.overviewGrid}>
              <section>
                <h3><span data-tone="accent"><Wallet size={16} aria-hidden /></span>Fee calculation</h3>
                <QuoteFacts items={[
                  ["You send", `${money(amount)} ${from}`],
                  ["Known provider fee", row.feeAmount === null ? (row.feeBreakdown ? "See Notes" : "Confirm at checkout") : `${money(row.feeAmount)} ${row.feeCurrency ?? ""}`],
                  ["Exchange rate used", row.rate === null ? "Not supplied" : `1 ${from} = ${row.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${to}`],
                  [receiveLabel, row.recipientAmount === null ? "Unavailable" : `${money(row.recipientAmount)} ${to}`],
                ]} />
              </section>
              <section>
                <h3><span><Banknote size={16} aria-hidden /></span>Benchmark vs. mid-market</h3>
                <QuoteFacts items={[
                  ["Mid-market amount", difference.kind === "cost" ? `${money(difference.baselineMinor / 100)} ${to}` : "Unavailable"],
                  [receiveLabel, row.recipientAmount === null ? "Unavailable" : `${money(row.recipientAmount)} ${to}`],
                  [difference.kind === "cost" && difference.costMinor < 0 ? "Above mid-market" : "Difference", difference.kind === "cost" ? `${money(Math.abs(difference.costMinor) / 100)} ${to} (${Math.abs(difference.bps)} bps)` : "Unavailable"],
                ]} />
                {difference.kind === "cost" && <div className={styles.benchmarkScale} data-better={difference.costMinor < 0 || undefined} title="Bar shows the size of the difference on a 0% to 10% scale">
                  <span aria-hidden><i style={{ width: `${Math.min(100, Math.abs(difference.bps) / 10)}%` }} /></span><strong>{percent}</strong>
                </div>}
                {cost.kind === "gap" && <p className={styles.gapNote}><Info size={14} aria-hidden />{cost.reason}</p>}
                {offer ? <div className={styles.offerBox}>
                  <span><Gift size={14} aria-hidden />Offer{offer.newCustomersOnly ? " · new customers" : ""}{offerEnds(offer) ? ` · ${offerEnds(offer)}` : ""}</span>
                  <strong>{offer.headline}</strong>
                  <p>{offer.terms} The price above doesn’t include it.</p>
                  <a href={offer.sourceUrl} target="_blank" rel="noreferrer noopener">Offer terms on the provider’s site<ArrowUpRight size={12} aria-hidden /></a>
                </div> : null}
              </section>
            </div>
            <div className={styles.overviewDisclosures}>
              <div className={styles.overviewDisclosure}>
                <details>
                  <summary>
                    <span className={styles.disclosureIcon}><Layers3 size={17} aria-hidden /></span>
                    <strong>Pricing methodology &amp; source<small>{sourceTime}</small></strong>
                    <ChevronDown size={16} aria-hidden />
                  </summary>
                  <div className={styles.overviewBody}>
                    {sourceDetails}
                    <p className={styles.detailIntro}>Railor compares the quoted payout with the amount at the mid-market rate. One basis point (bps) equals 0.01 percentage points.</p>
                  </div>
                </details>
                {row.source.url && <a className={styles.overviewSource} href={row.source.url} target="_blank" rel="noreferrer noopener">View source <ArrowUpRight size={13} aria-hidden /></a>}
              </div>
              <div className={styles.overviewDisclosure}>
                <details>
                  <summary>
                    <span className={styles.disclosureIcon}><ShieldCheck size={17} aria-hidden /></span>
                    <strong>Transfer requirements</strong>
                    <ChevronDown size={16} aria-hidden />
                  </summary>
                  <div className={styles.overviewBody}>
                    <QuoteFacts items={[
                      ["Payment method", fundingMethod(row) ?? "Confirm with provider"],
                      ["Who pays the fee", row.side === "payer" ? "Sender" : row.side === "recipient" ? "Deducted before payout" : "Confirm with provider"],
                    ]} />
                    {requirements}
                  </div>
                </details>
              </div>
            </div>
          </>
        )}
        {tab === "Requirements" && requirements}
        {tab === "Sources" && sourceDetails}
        {tab === "Notes" && <>
          {row.side === "payer" && <p className={styles.detailIntro}>The sender pays through this service. The recipient only needs a bank account.</p>}
          {row.feeBreakdown && <QuoteFacts items={[["Fee breakdown", row.feeBreakdown]]} />}
          {row.missing?.length ? <ul className={styles.quoteNotes}>{row.missing.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
          {row.shortfall ? <p className={styles.detailIntro}>{money(Math.abs(row.shortfall))} {to} {row.shortfall > 0 ? "less" : "more"} than the best documented payout.</p> : null}
          {row.notes.map((note, index) => <p className={styles.detailIntro} key={index}>{note}</p>)}
          {!row.notes.length && !row.feeBreakdown && !row.missing?.length && !row.shortfall && row.side !== "payer" && <p className={styles.detailIntro}>No additional provider notes were supplied.</p>}
        </>}
      </div>
    </aside>
  );
}
