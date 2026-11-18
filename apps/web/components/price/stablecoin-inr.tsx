"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, CircleHelp, Landmark, LockKeyhole, Minus, Receipt, TriangleAlert, X } from "lucide-react";
import { ProviderLogo } from "../app/provider-logo";
import { EXCHANGES_CHECKED, INDIA_EXCHANGES, TAX_TOOLS, depositSupport, exchangeBySlug, vdaTax, type DepositSupport, type ExchangeQuote } from "../../lib/india-exchanges";
import { ALL_NETWORKS, NETWORKS, TOKENS, type Network, type Stablecoin } from "../../lib/stablecoin-routes";
import styles from "./stablecoin.module.css";

export type LockedExchange = Pick<ExchangeQuote, "slug" | "name" | "support" | "status">;
export type ExchangeResponse = { locked: true; exchanges: LockedExchange[] } | { locked: false; exchanges: ExchangeQuote[] };

const REFRESH_MS = 30_000;
const CHECKED = new Date(`${EXCHANGES_CHECKED}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const inr = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Live exchange quotes for the selection, re-checked every 30 seconds while the tab is visible. */
export function useExchangeQuotes(asset: Stablecoin, network: Network, amount: number, enabled: boolean) {
  const key = `${asset}:${network}:${amount}`;
  const active = enabled && amount > 0 && Number.isFinite(amount);
  const [response, setResponse] = useState<{ key: string; data: ExchangeResponse | null; error: string; loading: boolean } | null>(null);
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
        const res = await fetch(`/api/stablecoin?${new URLSearchParams({ asset, network, amount: String(amount) })}`, { signal: ctl.signal, cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ExchangeResponse & { error?: string };
        if (ctl.signal.aborted) return;
        if (!res.ok) throw new Error(body.error ?? "Exchange prices couldn’t load right now.");
        if (typeof body.locked !== "boolean" || !Array.isArray(body.exchanges)) throw new Error("Exchange prices couldn’t load right now.");
        setResponse({ key, data: body, error: "", loading: false });
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
  }, [asset, network, amount, active, key]);

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
  const exchanges: Array<LockedExchange | ExchangeQuote> = data?.exchanges ?? INDIA_EXCHANGES.map((exchange) => ({ slug: exchange.slug, name: exchange.name, support: depositSupport(exchange, asset, network), status: "priced" as const }));
  const showLocked = locked || data?.locked === true;

  return (
    <section className={styles.exchanges} aria-labelledby="exchanges-title">
      <header className={styles.exchangesHead}>
        <div>
          <h3 id="exchanges-title">Sell on an Indian exchange</h3>
          <p>Live {asset}/INR order books. Fees, GST, 1% TDS and the INR withdrawal come off; income tax is shown below.</p>
        </div>
        {!showLocked ? (
          <label className={styles.cost}>
            <span>What it cost you (₹, total)</span>
            <input inputMode="decimal" placeholder="Optional" value={costText} onChange={(event) => setCostText(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 14))} aria-describedby="cost-hint" />
            <small id="cost-hint">The price you paid, or its INR value when you received it. Leave empty to see the most tax you could owe.</small>
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

export function ExchangeCard({ quote, asset, network, amount, cost, locked, loading, best, signInHref }: { quote: LockedExchange | ExchangeQuote; asset: Stablecoin; network: Network; amount: number; cost: number | null; locked: boolean; loading: boolean; best: boolean; signInHref: string }) {
  const exchange = exchangeBySlug(quote.slug)!;
  const full = "breakdown" in quote ? quote : null;
  const breakdown = full?.breakdown;
  const tax = breakdown ? vdaTax(breakdown, cost) : null;
  const rows: Array<[string, string, string?]> = breakdown && full?.fill ? [
    ["Sale value", inr(breakdown.gross), `${full.fill.filled.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${asset} at ₹${full.fill.averagePrice.toFixed(2)} average`],
    [`Trading fee (${(exchange.feeRate * 100).toFixed(2)}%)`, `− ${inr(breakdown.tradingFee)}`],
    ["GST on the fee (18%)", `− ${inr(breakdown.gst)}`],
    ["TDS (1%)", `− ${inr(breakdown.tds)}`, "Deducted by the exchange; it counts towards your tax"],
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

      {locked ? (
        <Link href={signInHref} className={styles.lockedQuote} aria-label={`Sign in to see what ${exchange.name} pays`}>
          <span className={styles.lockedRow}><span>In your bank</span><strong className={styles.blurred} aria-hidden>₹00,000.00</strong></span>
          <span className={styles.lockedRow}><span>After income tax</span><strong className={styles.blurred} aria-hidden>₹00,000.00</strong></span>
          <span className={styles.lockBadge}><LockKeyhole size={13} aria-hidden />Sign in to see the full price</span>
        </Link>
      ) : loading ? <p className={styles.quoteStatus}>Refreshing quote…</p> : quote.status !== "priced" || !breakdown || !tax ? (
        <p className={styles.caution}><TriangleAlert size={13} aria-hidden />{"reason" in quote && quote.reason ? quote.reason : "No price right now."}</p>
      ) : (
        <>
          <div className={styles.inBank}>
            <span><Landmark size={14} aria-hidden />In your bank</span>
            <strong>{inr(breakdown.inBank)}</strong>
          </div>
          <dl className={styles.breakdown}>
            {rows.map(([label, value, hint]) => (
              <div key={label}><dt>{label}{hint ? <small>{hint}</small> : null}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <div className={styles.taxBox}>
            <p className={styles.taxTitle}><Receipt size={14} aria-hidden />Income tax on this sale</p>
            <dl className={styles.breakdown}>
              <div><dt>Gain{tax.worstCase ? <small>No cost entered, so the whole sale counts as gain</small> : <small>Sale value minus your cost. Fees can’t be deducted.</small>}</dt><dd>{inr(tax.gain)}</dd></div>
              <div><dt>30% tax + 4% cess<small>Section 115BBH. Surcharge applies above ₹50 lakh income and isn’t included.</small></dt><dd>{inr(tax.tax)}</dd></div>
              <div><dt>Less TDS already deducted</dt><dd>− {inr(breakdown.tds)}</dd></div>
              <div><dt>{tax.balance >= 0 ? "Still to pay when you file" : "Refund when you file"}</dt><dd>{inr(Math.abs(tax.balance))}</dd></div>
            </dl>
            <div className={styles.afterTax}><span>Yours after tax{tax.worstCase ? " (most you could owe)" : ""}</span><strong>{inr(tax.afterTax)}</strong></div>
          </div>
          {full!.fill!.short ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />The visible order book only holds {full!.fill!.filled.toLocaleString("en-US")} of your {amount.toLocaleString("en-US")} {asset}. A sale this big would fill lower, or in parts.</p> : null}
          {full!.belowMinimum ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />Below {exchange.name}’s ₹{exchange.withdrawalMin} minimum INR withdrawal.</p> : null}
          {full!.aboveMaximum ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />Above {exchange.name}’s ₹{exchange.withdrawalMax!.toLocaleString("en-IN")} limit per withdrawal, so it goes out in several.</p> : null}
          <p className={styles.feeNote}>{exchange.feeNote}{exchange.withdrawalNote ? ` ${exchange.withdrawalNote}` : ""}</p>
        </>
      )}
      <footer>
        <span>Order book read live · fees checked {CHECKED}</span>
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
          <thead><tr><th scope="col">Network</th>{INDIA_EXCHANGES.map((exchange) => <th key={exchange.slug} scope="col">{exchange.name}</th>)}</tr></thead>
          <tbody>
            {ALL_NETWORKS.map((value) => {
              const issued = Boolean(TOKENS[asset].addresses[value]);
              return (
                <tr key={value} data-current={value === network || undefined} data-unissued={!issued || undefined}>
                  <th scope="row"><i style={{ background: NETWORKS[value].color }} aria-hidden />{NETWORKS[value].label}</th>
                  {INDIA_EXCHANGES.map((exchange) => {
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
      <p>Every sale is reported in your ITR under Schedule VDA, at 30% plus cess on gains. Losses can’t be set off. The exchange’s TDS shows in Form 26AS and AIS and counts towards that tax.</p>
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
      <p className={styles.footnote}>Railor isn’t a tax adviser and has no tie to these services. Sources: <a href="https://incometaxindia.gov.in/documents/20117/42998/Taxation-of-Virtual-Digital-Asset-VDA_2026-01-06_06-43-57_cfe04a_en.pdf/153706c8-7b5c-77d4-fc56-624c50ece1b0" target="_blank" rel="noreferrer noopener">VDA taxation</a> and <a href="https://wm.incometaxindia.gov.in/w/tds-on-payment-for-the-transfer-of-virtual-digital-assets-vdas-" target="_blank" rel="noreferrer noopener">TDS under 194S</a>, Income Tax Department.</p>
    </section>
  );
}
