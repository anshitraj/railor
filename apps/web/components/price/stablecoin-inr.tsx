"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, CircleHelp, Landmark, LockKeyhole, Minus, Receipt, TriangleAlert, X } from "lucide-react";
import { ProviderLogo } from "../app/provider-logo";
import { EXCHANGES_CHECKED, TAX_TOOLS, depositSupport, exchangeBySlug, exchangesFor, vdaTax, type DepositSupport, type ExchangeQuote, type LiveBid } from "../../lib/india-exchanges";
import { ALL_NETWORKS, NETWORKS, TOKENS, type CashOutCurrency, type Network, type Stablecoin } from "../../lib/stablecoin-routes";
import type { CashOutResponse } from "../../lib/stablecoin-cash-out";
import styles from "./stablecoin.module.css";

export type LockedExchange = Pick<ExchangeQuote, "slug" | "name" | "support" | "status">;
export type ExchangeResponse = { locked: true; exchanges: LockedExchange[] } | { locked: false; exchanges: ExchangeQuote[]; reference?: { rate: number; source: string; observedAt: string } | null };

const REFRESH_MS = 30_000;
const CHECKED = new Date(`${EXCHANGES_CHECKED}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const inr = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Live exchange quotes for the selection, re-checked every 30 seconds while the tab is visible. */
export function useExchangeQuotes(asset: Stablecoin, network: Network, amount: number, enabled: boolean) {
  return useStablecoinRequest<ExchangeResponse>(asset, network, amount, enabled, "INR");
}

export function useCashOutQuote(asset: Stablecoin, network: Network, amount: number, destination: CashOutCurrency | null, enabled: boolean) {
  return useStablecoinRequest<CashOutResponse>(asset, network, amount, enabled && destination !== null, destination ?? "INR");
}

function useStablecoinRequest<T extends ExchangeResponse | CashOutResponse>(asset: Stablecoin, network: Network, amount: number, enabled: boolean, destination: "INR" | CashOutCurrency) {
  const key = `${asset}:${network}:${amount}:${destination}`;
  const active = enabled && amount > 0 && amount <= 10_000_000;
  const [response, setResponse] = useState<{ key: string; data: T | null; error: string; loading: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) {
      setResponse(null);
      return;
    }
    setResponse({ key, data: null, error: "", loading: true });
    let timer: number | undefined;
    const load = async () => {
      controller.current?.abort();
      const ctl = new AbortController();
      controller.current = ctl;
      setResponse({ key, data: null, error: "", loading: true });
      try {
        const res = await fetch(`/api/stablecoin?${new URLSearchParams({ asset, network, amount: String(amount), dest: destination })}`, { signal: ctl.signal, cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as (ExchangeResponse | CashOutResponse) & { error?: string };
        if (ctl.signal.aborted) return;
        if (!res.ok) throw new Error(body.error ?? "Exchange prices couldn’t load right now.");
        if (typeof body.locked !== "boolean" || (destination === "INR" && (!("exchanges" in body) || !Array.isArray(body.exchanges))) || (destination !== "INR" && !body.locked && !("quote" in body))) throw new Error("Exchange prices couldn’t load right now.");
        setResponse({ key, data: body as T, error: "", loading: false });
      } catch (cause) {
        if (!ctl.signal.aborted && (cause as Error).name !== "AbortError") setResponse({ key, data: null, error: (cause as Error).message || "Exchange prices couldn’t load right now.", loading: false });
      }
    };
    const start = window.setTimeout(() => void load(), 300);
    timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
      controller.current?.abort();
    };
  }, [asset, network, amount, active, key, destination]);

  const current = active && response?.key === key ? response : null;
  return { data: current?.data ?? null, error: current?.error ?? "", loading: active && (!current || current.loading) };
}

function SupportPill({ support, asset, network, name }: { support: { status: DepositSupport; note: string }; asset: Stablecoin; network: Network; name: string }) {
  const label = NETWORKS[network].label;
  const text = support.status === "yes" ? `Takes ${asset} on ${label}` : support.status === "no" ? `${name} doesn’t take ${asset} on ${label}` : `${asset} on ${label} not confirmed`;
  const Icon = support.status === "yes" ? Check : support.status === "no" ? X : CircleHelp;
  return (
    <span className={styles.support} data-status={support.status} title={support.note}>
      <Icon size={12} aria-hidden />{text}
    </span>
  );
}

/** Sell on an Indian exchange: what reaches the bank after fees and TDS, then after income tax. */
export function IndiaExchangePanel({ asset, network, amount, issued, locked, signInHref, quotes }: { asset: Stablecoin; network: Network; amount: number; issued: boolean; locked: boolean; signInHref: string; quotes: ReturnType<typeof useExchangeQuotes> }) {
  const reduce = useReducedMotion();
  const { data, error, loading } = quotes;
  const [costText, setCostText] = useState("");
  const cost = costText.trim() === "" ? null : Number(costText);

  if (!issued) return null;
  const exchanges: Array<LockedExchange | ExchangeQuote> = data?.exchanges ?? exchangesFor(asset).map((exchange) => ({ slug: exchange.slug, name: exchange.name, support: depositSupport(exchange, asset, network), status: "priced" as const }));
  const showLocked = locked || data?.locked === true;

  return (
    <section className={styles.exchanges} aria-labelledby="exchanges-title">
      <header className={styles.exchangesHead}>
        <div>
          <h3 id="exchanges-title">Sell on an Indian exchange</h3>
          <p>Live {asset}/INR order books. Shows trading fees, GST where charged separately, estimated TDS and bank withdrawal fees. Income tax is shown separately.</p>
        </div>
        {!showLocked ? (
          <label className={styles.cost}>
            <span>What it cost you (₹, total)</span>
            <input inputMode="decimal" placeholder="Optional" value={costText} onChange={(event) => setCostText(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 14))} aria-describedby="cost-hint" />
            <small id="cost-hint">The price you paid, or its INR value when you received it. Leave empty to see the estimate at zero acquisition cost.</small>
          </label>
        ) : null}
      </header>
      {error ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />{error}</p> : null}
      <ul className={styles.list} data-loading={loading || undefined} aria-busy={loading}>
        <AnimatePresence initial={false}>
          {exchanges.map((quote, index) => (
            <motion.li key={quote.slug} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: index * 0.05 }}>
              <ExchangeCard quote={quote} asset={asset} network={network} amount={amount} cost={cost} locked={showLocked} loading={loading} best={!showLocked && !loading && index === 0 && quote.status === "priced" && "breakdown" in quote} signInHref={signInHref} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

/** The exchange's live bid behind the quote, with when it was observed and how far it sits from the mid-market rate. */
function LiveBidNote({ live, asset }: { live: LiveBid; asset: Stablecoin }) {
  const date = new Date(live.observedAt);
  const when = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const gap = live.gapPct === null ? null : `${live.gapPct > 0 ? "+" : live.gapPct < 0 ? "−" : ""}${Math.abs(live.gapPct).toFixed(2)}%`;
  return (
    <div className={styles.live}>
      <dl className={styles.liveFacts}>
        <div>
          <dt>Best bid</dt>
          <dd>₹{live.bid.toFixed(2)} per {asset}{when ? <small title={live.clock === "exchange" ? "Time from the exchange’s own timestamp" : "When Railor read it; this exchange sends no time"}> · {live.clock === "exchange" ? "as of" : "read at"} {when}</small> : null}</dd>
        </div>
        {gap && live.referenceRate ? (
          <div>
            <dt>Against Wise mid-market</dt>
            <dd>{gap}<small> of ₹{live.referenceRate.toLocaleString("en-US", { maximumFractionDigits: 4 })} per USD</small></dd>
          </div>
        ) : null}
      </dl>
      <p className={styles.liveNote}>Market reference, not a quote. {asset} isn’t 1 USD, so the gap is the market’s price for {asset}, not a fee.</p>
    </div>
  );
}

export function ExchangeCard({ quote, asset, network, amount, cost, locked, loading, best, signInHref }: { quote: LockedExchange | ExchangeQuote; asset: Stablecoin; network: Network; amount: number; cost: number | null; locked: boolean; loading: boolean; best: boolean; signInHref: string }) {
  const exchange = exchangeBySlug(quote.slug)!;
  const full = "breakdown" in quote ? quote : null;
  const breakdown = full?.breakdown;
  const tax = breakdown ? vdaTax(breakdown, cost) : null;
  const rows: Array<[string, string, string?]> = breakdown && full?.fill ? [
    ["Sale value", inr(breakdown.gross), `${full.fill.filled.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${asset} at ₹${full.fill.averagePrice.toFixed(2)} average`],
    [`Trading fee (${(exchange.feeRate * 100).toFixed(2)}%${exchange.gstIncluded ? ", GST included" : ""})`, `− ${inr(breakdown.tradingFee)}`],
    ...(exchange.gstIncluded ? [] : [["GST on the fee (18%)", `− ${inr(breakdown.gst)}`] as [string, string]]),
    ["Estimated TDS (1%)", `− ${inr(breakdown.tds)}`, "Assumes the exchange withholds 1%. You can claim verified withholding as a tax credit."],
    ["INR withdrawal", breakdown.withdrawalFee ? `− ${inr(breakdown.withdrawalFee)}` : "Free"],
  ] : [];

  return (
    <article className={styles.route} data-kind={best ? "best" : undefined}>
      <header>
        <ProviderLogo slug={exchange.slug} name={exchange.name} size={34} />
        <div><h3>{exchange.name}{best ? <span className={styles.bestTag}>Most in your bank</span> : null}</h3><p>Sell {asset} for INR, withdraw to your bank</p></div>
        {breakdown && !locked ? <span className={styles.price}>₹{full!.fill!.averagePrice.toFixed(2)} / {asset}</span> : null}
      </header>
      <SupportPill support={quote.support} asset={asset} network={network} name={exchange.name} />
      {quote.support.status !== "yes" && quote.support.note ? <p className={styles.supportNote}>{quote.support.note}.</p> : null}

      {locked && !exchange.noLivePrice ? (
        <Link href={signInHref} className={styles.lockedQuote} aria-label={`Sign in to see what ${exchange.name} pays`}>
          <span className={styles.lockedRow}><span>In your bank</span><strong className={styles.blurred} aria-hidden>₹00,000.00</strong></span>
          <span className={styles.lockedRow}><span>After income tax</span><strong className={styles.blurred} aria-hidden>₹00,000.00</strong></span>
          <span className={styles.lockBadge}><LockKeyhole size={13} aria-hidden />Sign in to see the full price</span>
        </Link>
      ) : loading && !exchange.noLivePrice ? <p className={styles.quoteStatus}>Refreshing quote…</p> : exchange.noLivePrice ? (
        <p className={styles.caution}><TriangleAlert size={13} aria-hidden /><span><strong>No live price.</strong> {exchange.noLivePrice}.</span></p>
      ) : quote.status !== "priced" || !breakdown || !tax ? (
        <p className={styles.caution}><TriangleAlert size={13} aria-hidden />{"reason" in quote && quote.reason ? quote.reason : "No price right now."}</p>
      ) : (
        <>
          <div className={styles.inBank}>
            <span><Landmark size={14} aria-hidden />In your bank</span>
            <strong>{inr(breakdown.inBank)}</strong>
          </div>
          {full!.live ? <LiveBidNote live={full!.live} asset={asset} /> : null}
          <dl className={styles.breakdown}>
            {rows.map(([label, value, hint]) => (
              <div key={label}><dt>{label}{hint ? <small>{hint}</small> : null}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <div className={styles.taxBox}>
            <p className={styles.taxTitle}><Receipt size={14} aria-hidden />Income tax on this sale</p>
            <dl className={styles.breakdown}>
              <div><dt>Gain{tax.worstCase ? <small>No cost entered, so the whole sale counts as gain</small> : <small>Sale value minus your cost. Fees can’t be deducted.</small>}</dt><dd>{inr(tax.gain)}</dd></div>
              <div><dt>30% of gain + cess<small>Section 194, table item 4. Cess is 4% of the tax; the estimate excludes any applicable surcharge.</small></dt><dd>{inr(tax.tax)}</dd></div>
              <div><dt>Less TDS already deducted</dt><dd>− {inr(breakdown.tds)}</dd></div>
              <div><dt>{tax.balance >= 0 ? "Still to pay when you file" : "TDS credit above this sale’s estimated tax"}</dt><dd>{inr(Math.abs(tax.balance))}</dd></div>
            </dl>
            <div className={styles.afterTax}><span>Estimated after-tax proceeds{tax.worstCase ? " · zero acquisition cost assumed" : ""}</span><strong>{inr(tax.afterTax)}</strong></div>
          </div>
          {full!.live?.depth === "top" ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />{exchange.name} publishes only its best bid, not its order book, so all {amount.toLocaleString("en-US")} {asset} is priced at that bid. A bigger sale can fill lower.</p> : null}
          {full!.fill!.short ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />The visible order book only holds {full!.fill!.filled.toLocaleString("en-US")} of your {amount.toLocaleString("en-US")} {asset}. A sale this big would fill lower, or in parts.</p> : null}
          {full!.belowMinimum ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />Below {exchange.name}’s ₹{exchange.withdrawalMin} minimum INR withdrawal.</p> : null}
          {full!.aboveMaximum ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />Above {exchange.name}’s ₹{exchange.withdrawalMax!.toLocaleString("en-IN")} limit per withdrawal, so it goes out in several.</p> : null}
          <p className={styles.feeNote}>{exchange.feeNote}{exchange.withdrawalNote ? ` ${exchange.withdrawalNote}` : ""}</p>
        </>
      )}
      <footer>
        <span>{full?.live ? `${full.live.depth === "top" ? "Best bid" : "Order book"} read live · fees` : "Fees"} checked {CHECKED}</span>
        <span className={styles.links}>
          <a href={exchange.feeSource} target="_blank" rel="noreferrer noopener">Fees <ArrowUpRight size={11} /></a>
          <a href={exchange.networks[asset].source} target="_blank" rel="noreferrer noopener">Networks <ArrowUpRight size={11} /></a>
          <a href={exchange.tradeUrl(asset)} target="_blank" rel="noreferrer noopener">Open {exchange.name} <ArrowUpRight size={11} /></a>
        </span>
      </footer>
    </article>
  );
}

/** Which networks each exchange takes for the token, by its own published list. */
export function NetworkSupportTable({ asset, network }: { asset: Stablecoin; network: Network }) {
  return (
    <details className={styles.matrix}>
      <summary>Which networks each exchange takes for {asset}</summary>
      <div className={styles.matrixScroll}>
        <table>
          <thead><tr><th scope="col">Network</th>{exchangesFor(asset).map((exchange) => <th key={exchange.slug} scope="col">{exchange.name}</th>)}</tr></thead>
          <tbody>
            {ALL_NETWORKS.map((value) => {
              const issued = Boolean(TOKENS[asset].addresses[value]);
              return (
                <tr key={value} data-current={value === network || undefined} data-unissued={!issued || undefined}>
                  <th scope="row"><i style={{ background: NETWORKS[value].color }} aria-hidden />{NETWORKS[value].label}</th>
                  {exchangesFor(asset).map((exchange) => {
                    if (!issued) return <td key={exchange.slug} title={`${TOKENS[asset].issuer} doesn’t issue ${asset} here`}><Minus size={14} aria-label="Not issued" /></td>;
                    const support = depositSupport(exchange, asset, value);
                    return (
                      <td key={exchange.slug} data-status={support.status} title={support.note}>
                        {support.status === "yes" ? <Check size={15} aria-label="Takes it" /> : support.status === "no" ? <X size={15} aria-label="Doesn’t take it" /> : <CircleHelp size={15} aria-label="Not confirmed" />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.matrixKey}><span><Check size={12} />Listed by the exchange</span><span><X size={12} />Not taken: sending it there can lose the funds</span><span><CircleHelp size={12} />Not confirmed</span><span><Minus size={12} />{TOKENS[asset].issuer} doesn’t issue {asset} there</span></p>
    </details>
  );
}

/** Crypto sales need reporting; where people do that. */
export function TaxTools() {
  return (
    <section className={styles.taxTools} aria-labelledby="tax-tools-title">
      <h3 id="tax-tools-title"><Receipt size={15} aria-hidden />Crypto tax and filing</h3>
      <p>Indian VDA gain is taxed at 30% plus applicable cess and surcharge. VDA losses cannot offset other income. Claim withholding that appears in your official tax records as a credit.</p>
      <ul>
        {TAX_TOOLS.map((tool) => (
          <li key={tool.slug}>
            <a href={tool.url} target="_blank" rel="noreferrer noopener">
              <ProviderLogo slug={tool.slug} name={tool.name} size={30} />
              <span><strong>{tool.name}</strong><small>{tool.what}</small></span>
              <ArrowUpRight size={14} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className={styles.footnote}>Railor isn’t a tax adviser and has no tie to these services. Sources: <a href="https://www.incometaxindia.gov.in/documents/20117/42998/Section-194_2026-01-06_03-25-24_661ea6_en.pdf/cd86c4da-c15b-f3b7-b25f-be125d2517f4" target="_blank" rel="noreferrer noopener">Income-tax Act section 194</a> and <a href="https://www.incometaxindia.gov.in/documents/20117/42998/Section-393_2026-03-27_10-53-24_00f77b_en.pdf/e3e175fc-b0b9-b1b1-b533-083cff93fcbd" target="_blank" rel="noreferrer noopener">TDS under section 393</a>, Income Tax Department.</p>
    </section>
  );
}
