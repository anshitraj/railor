"use client";

import { useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Copy, Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { CurrencyLogo } from "../marketing/currency-logo";
import { ProviderLogo } from "../app/provider-logo";
import { toast } from "../toast";
import { NETWORKS, STABLECOIN_CHECKED, TOKENS, isCashOutCurrency, isCashPickupCurrency, notIssuedReason, stablecoinRoutes, swapOption, type CashOutCurrency, type Destination, type Network, type RouteCard, type Stablecoin } from "../../lib/stablecoin-routes";
import { ExchangeCard, NetworkSupportTable, TaxTools, inr, useCashOutQuote, useExchangeQuotes, type LockedExchange } from "./stablecoin-inr";
import { depositSupport, exchangeBySlug, exchangesFor, type ExchangeQuote } from "../../lib/india-exchanges";
import { CASH_OUT_RAILS, KRAKEN_CANADA, KRAKEN_EEA, KRAKEN_FEES, KRAKEN_NETWORKS, KRAKEN_TAKER_RATE, KRAKEN_WITHDRAWALS, cashOutRestriction, fiat, type CashOutQuote } from "../../lib/stablecoin-cash-out";
import { StablecoinPicker } from "./stablecoin-picker";
import { RateHistoryChart } from "./rate-history-chart";
import comparisonStyles from "../app/price-check.module.css";
import priceStyles from "./price.module.css";
import styles from "./stablecoin.module.css";

const PRICE_CTA = `${priceStyles.compare} ${styles.cardCta} press`;
const CHECKED = new Date(`${STABLECOIN_CHECKED}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function short(address: string) {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy isn’t available here", "Select the address and copy it instead.");
  }
}

export function StablecoinQuote({ initial, locked = false }: { initial: { asset: Stablecoin; network: Network | null; destination: Destination; amount: number }; locked?: boolean }) {
  const reduce = useReducedMotion();
  const [asset, setAsset] = useState<Stablecoin>(initial.asset);
  const [network, setNetwork] = useState<Network>(initial.network ?? "ethereum");
  const issued = Boolean(TOKENS[asset].addresses[network]);
  const [destination, setDestination] = useState<Destination>(initial.destination);
  const [amountText, setAmountText] = useState(String(initial.amount));
  const amount = Number(amountText) || 0;
  const cashPickup = isCashPickupCurrency(destination);
  const pickupHint = cashPickup && (asset !== "USDC" || network !== "solana") ? "Choose USDC on Solana to see the MoneyGram cash pickup route." : null;
  const cashCurrency = isCashOutCurrency(destination) ? destination : null;
  const cashRestriction = cashCurrency ? cashOutRestriction(asset, network, cashCurrency) : null;
  const cash = useCashOutQuote(asset, network, amount, cashCurrency, issued && !locked && !cashRestriction);
  const cashQuote = !locked && cash.data?.locked === false ? cash.data.quote : null;
  const cashReason = cashRestriction ?? (cash.data?.locked === false ? cash.data.reason : cash.error);
  const cashOutLabel = cashCurrency && cashQuote ? fiat(cashQuote.payout, cashCurrency) : null;
  const krakenUrl = "https://pro.kraken.com/app/trade/" + asset.toLowerCase() + "-" + destination.toLowerCase();
  const quotes = useExchangeQuotes(asset, network, amount, destination === "INR" && issued);
  const recommended = quotes.data && !quotes.data.locked && !locked
    ? quotes.data.exchanges.find((quote) => quote.status === "priced" && quote.support.status === "yes" && quote.breakdown && Number.isFinite(quote.breakdown.inBank) && quote.breakdown.inBank > 0 && !quote.fill?.short && !quote.belowMinimum && quote.live?.depth !== "top")
    : undefined;
  const [picked, setPicked] = useState<{ context: string; id: string } | null>(null);
  const [tab, setTab] = useState<"prices" | "history">("prices");
  const [costText, setCostText] = useState("");
  const cost = costText.trim() === "" ? null : Number(costText);
  const context = `${asset}:${network}:${destination}`;
  const showLocked = (destination === "INR" && (locked || quotes.data?.locked === true)) || (cashCurrency !== null && issued && !cashRestriction && (locked || cash.data?.locked === true));
  const pending = destination === "INR" ? quotes.loading : cash.loading;
  const routes = useMemo(() => (issued ? stablecoinRoutes(asset, network, destination, amount) : []), [issued, asset, network, destination, amount]);
  const swap = useMemo(() => (destination === "EURC" && issued ? swapOption(asset, network, amount) : null), [issued, asset, network, destination, amount]);
  const query = new URLSearchParams({ mode: "stablecoin", asset, network, dest: destination, amount: String(amount || 1000) });
  const signInHref = `/login?intent=start&next=${encodeURIComponent(`/app/prices?${query}`)}`;
  const exchanges: Array<LockedExchange | ExchangeQuote> = destination === "INR" && issued
    ? quotes.data?.exchanges ?? exchangesFor(asset).map((exchange) => ({ slug: exchange.slug, name: exchange.name, support: depositSupport(exchange, asset, network), status: "unavailable" as const }))
    : [];
  const entries = [
    ...(cashCurrency && issued ? [{ id: "kraken", slug: "kraken", name: "Kraken Pro", hint: CASH_OUT_RAILS[cashCurrency].method, quote: undefined, route: undefined, dex: false }] : []),
    ...exchanges.map((quote) => ({ id: quote.slug, slug: quote.slug, name: quote.name, hint: `${asset} on ${NETWORKS[network].label} → INR`, quote, route: undefined as RouteCard | undefined, dex: false })),
    ...(swap && swap.kind !== "none" ? [{ id: swap.kind, slug: swap.kind, name: swap.name, hint: `${asset} → EURC on ${NETWORKS[network].label}`, quote: undefined, route: undefined, dex: true }] : []),
    ...routes.map((route) => ({ id: route.id, slug: route.slug, name: route.provider, hint: route.title, quote: undefined, route, dex: false })),
  ];
  const count = entries.length;
  const selected = entries.find((entry) => entry.id === (picked?.context === context ? picked.id : recommended?.slug)) ?? entries[0];
  const selectedQuote = selected?.quote && "breakdown" in selected.quote ? selected.quote : undefined;
  const pricedSelection = !showLocked && selectedQuote?.support.status === "yes" && !selectedQuote.fill?.short && !selectedQuote.belowMinimum && selectedQuote.breakdown && Number.isFinite(selectedQuote.breakdown.inBank) && selectedQuote.breakdown.inBank > 0 ? selectedQuote : undefined;
  const choose = (id: string) => {
    setPicked({ context, id });
    requestAnimationFrame(() => {
      const panel = document.getElementById("stablecoin-selected-provider");
      if (panel && getComputedStyle(panel).position === "static") { panel.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); panel.focus({ preventScroll: true }); }
    });
  };

  return (
    <section className={comparisonStyles.comparisonLayout} aria-labelledby="stablecoin-title">
      <div className={`price-surface p-3 sm:p-4 ${styles.swapCard} ${styles.calculator}`}>
        <div className={styles.head}>
          <h2 id="stablecoin-title" className={styles.cardTitle}><span className={priceStyles.liveDot} data-loading={pending || undefined} aria-hidden />Stablecoin routes</h2>
          <span className={styles.checked} title="Token addresses, fees and route facts re-read from each issuer’s and provider’s own pages">
            <ShieldCheck size={13} aria-hidden />Sources checked {CHECKED}
          </span>
        </div>

        <div className={`${priceStyles.fields} ${styles.swapFields}`}>
          <div className={`${priceStyles.field} ${styles.swapField}`}>
            <label htmlFor="stablecoin-amount" className={priceStyles.fieldLabel}>You have</label>
            <div className={priceStyles.fieldRow}>
              <input id="stablecoin-amount" className={priceStyles.amount} inputMode="decimal" autoComplete="off" placeholder="0" value={amountText} aria-label={`Amount in ${asset}`} onChange={(event) => setAmountText(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 14))} />
              <StablecoinPicker side="from" value={asset} network={network} onChange={(token, chain) => { setAsset(token); setNetwork(chain); }} />
            </div>
            <p className={styles.rowHint}>{asset} on {NETWORKS[network].label}</p>
          </div>
          <span className={`${priceStyles.swap} ${styles.direction}`} aria-hidden><ArrowDown size={16} /></span>
          <div className={`${priceStyles.field} ${styles.swapField}`} data-output>
            <span className={priceStyles.fieldLabel}>You receive</span>
            <div className={priceStyles.fieldRow}>
              <output className={`${priceStyles.amount} ${styles.receiveAmount}`} data-status={(!pricedSelection && !cashOutLabel) || undefined} aria-live="polite" aria-busy={pending}>
                {pending ? "Refreshing…" : showLocked ? "Sign in to see" : cashOutLabel ?? (pricedSelection?.breakdown ? pricedSelection.breakdown.inBank.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Quote unavailable")}
              </output>
              <StablecoinPicker side="to" value={destination} network={network} onChange={setDestination} />
            </div>
            <p className={styles.rowHint}>{showLocked ? "Free account · see exchange prices" : pricedSelection ? <>via <strong>{pricedSelection.name}</strong> · after fees and estimated TDS</> : cashOutLabel ? <>via <strong>Kraken Pro</strong> · after known fees, before personal tax</> : pickupHint ?? cashRestriction ?? (cashPickup ? "Check the FX rate and fees in a MoneyGram-enabled wallet." : destination === "EURC" ? "Check the live rate on the DEX before confirming." : pending ? "Checking this amount, token and network…" : "No usable price for this selection.")}</p>
          </div>
        </div>

        {destination === "INR" ? (
          showLocked ? <Link href={signInHref} className={`${priceStyles.compare} ${styles.cardCta} press`}>Sign in to see prices<ArrowRight size={16} aria-hidden /></Link>
          : pricedSelection ? <a className={`${priceStyles.compare} ${styles.cardCta} press`} href={exchangeBySlug(pricedSelection.slug)!.tradeUrl(asset)} target="_blank" rel="noreferrer noopener">Go to {pricedSelection.name}<ArrowUpRight size={16} aria-hidden /></a>
          : selected?.route ? <a className={`${priceStyles.compare} ${styles.cardCta} press`} href={selected.route.sourceUrl} target="_blank" rel="noreferrer noopener">Open {selected.name}<ArrowUpRight size={16} aria-hidden /></a> : <button type="button" disabled className={`${priceStyles.compare} ${styles.cardCta}`} aria-disabled="true">{pending ? "Refreshing quotes…" : "Quote unavailable"}</button>
        ) : cashCurrency && showLocked ? (
          <Link href={signInHref} className={PRICE_CTA}>Sign in to see prices<ArrowRight size={16} aria-hidden /></Link>
        ) : cashCurrency && issued && !cashRestriction ? (
          <a className={PRICE_CTA} href={krakenUrl} target="_blank" rel="noreferrer noopener">Open Kraken Pro<ArrowUpRight size={16} aria-hidden /></a>
        ) : selected?.route ? (
          <a className={`${priceStyles.compare} ${styles.cardCta} press`} href={selected.route.sourceUrl} target="_blank" rel="noreferrer noopener">Open {selected.name}<ArrowUpRight size={16} aria-hidden /></a>
        ) : swap && swap.kind !== "none" ? (
          <a className={`${priceStyles.compare} ${styles.cardCta} press`} href={swap.url} target="_blank" rel="noreferrer noopener">Open {swap.name}<ArrowUpRight size={16} aria-hidden /></a>
        ) : <button type="button" disabled className={`${priceStyles.compare} ${styles.cardCta}`} aria-disabled="true">Quote unavailable</button>}
        <p className={styles.parity}><Info size={14} aria-hidden />Railor doesn’t treat 1 {asset} as 1 USD. The provider or DEX confirms the final rate.</p>
      </div>

      <section className={comparisonStyles.providers} aria-label="Stablecoin provider comparison">
        <div className={comparisonStyles.browserTabs} role="tablist" aria-label="Stablecoin pricing view" onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); const next = event.key === "Home" ? "prices" : event.key === "End" ? "history" : tab === "prices" ? "history" : "prices";
          setTab(next); document.getElementById(`stablecoin-tab-${next}`)?.focus();
        }}>
          <button type="button" role="tab" id="stablecoin-tab-prices" aria-controls="stablecoin-panel-prices" aria-selected={tab === "prices"} tabIndex={tab === "prices" ? 0 : -1} onClick={() => setTab("prices")}>Prices <span>{count}</span></button>
          <button type="button" role="tab" id="stablecoin-tab-history" aria-controls="stablecoin-panel-history" aria-selected={tab === "history"} tabIndex={tab === "history" ? 0 : -1} onClick={() => setTab("history")}>Historical data</button>
        </div>
        <div id="stablecoin-panel-prices" role="tabpanel" aria-labelledby="stablecoin-tab-prices" hidden={tab !== "prices"}>
          <p className={styles.selectionSummary}><strong>{count} {cashCurrency ? "provider" : "verified route"}{count === 1 ? "" : "s"}</strong> for {asset} on {NETWORKS[network].label} → {destination}</p>
          <div className={comparisonStyles.tableHeader} aria-hidden><span>Provider</span><span>You receive</span></div>
          <ol className={comparisonStyles.providerRows} aria-label="Stablecoin provider prices" aria-busy={pending}>
            {entries.map((entry) => {
              const full = entry.quote && "breakdown" in entry.quote ? entry.quote : undefined;
              return <li key={entry.id}><button type="button" className={`${comparisonStyles.providerRow} ${styles.quoteRow}`} aria-pressed={entry.id === selected?.id} aria-label={`Select ${entry.name}`} onClick={() => choose(entry.id)}>
                <span className={comparisonStyles.providerName}><ProviderLogo slug={entry.slug} name={entry.name} size={29} /><span><strong>{entry.name}</strong>{entry.id === recommended?.slug ? <small>Most in your bank</small> : null}</span></span>
                <span className={comparisonStyles.rowAmount}><strong>{entry.quote && exchangeBySlug(entry.slug)?.noLivePrice ? "No live price" : showLocked && entry.quote ? "Sign in to see" : entry.quote && pending ? "Refreshing…" : full?.status === "priced" && full.breakdown ? inr(full.breakdown.inBank) : entry.id === "kraken" ? (pending ? "Refreshing…" : showLocked ? "Sign in to see" : cashOutLabel ?? "Quote unavailable") : entry.dex ? "Live rate on DEX" : entry.route?.price ?? "Quote unavailable"}</strong></span>
                <span className={styles.rowDescription}>{entry.hint}{entry.quote ? ` · ${entry.quote.support.status === "yes" ? "Network supported" : entry.quote.support.status === "no" ? "Network not supported" : "Check network support"}` : ""}</span>
              </button></li>;
            })}
          </ol>
          {!entries.length ? <div className={comparisonStyles.contextEmpty}>{swap?.kind === "none" ? swap.reason : issued ? "No verified route for this selection." : notIssuedReason(asset, network)}</div> : null}
          <p className={comparisonStyles.tableNote}>Select a provider to see its fees, network support and handoff details.</p>
        </div>
        <div id="stablecoin-panel-history" role="tabpanel" aria-labelledby="stablecoin-tab-history" hidden={tab !== "history"} className={comparisonStyles.contextPanel}>
          {tab === "history" && (cashCurrency || cashPickup) ? <p className={comparisonStyles.contextEmpty}>Historical payout estimates are unavailable for this currency.</p> : tab === "history" ? <RateHistoryChart key={`${context}:${selected?.slug}`} mode="stablecoin" from={asset} to={destination} network={network} provider={selected?.slug} amount={amount} /> : null}
        </div>
      </section>

      <aside id="stablecoin-selected-provider" tabIndex={-1} className={`${comparisonStyles.selectedPanel} ${styles.selectedDetails}`} aria-label="Selected stablecoin provider">
        {selected ? <>
          <p className={styles.detailSelection}>{asset} on {NETWORKS[network].label} → {destination === "EURC" ? `EURC on ${NETWORKS[network].label}` : `${destination} · ${cashPickup || selected.id === "moneygram-ramps" ? "Cash pickup" : "Bank account"}`}</p>
          {cashCurrency ? <CashOutDetails asset={asset} currency={cashCurrency} quote={cashQuote} reason={cashReason} /> : selected.quote ? <>
            {!showLocked ? <label className={`${styles.cost} ${styles.detailCost}`}><span>What it cost you (₹, total)</span><input inputMode="decimal" placeholder="Optional" value={costText} onChange={(event) => setCostText(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 14))} /><small>Optional acquisition cost for the income-tax breakdown.</small></label> : null}
            <ExchangeCard key={selected.id} quote={selected.quote} asset={asset} network={network} amount={amount} cost={cost} locked={showLocked} loading={pending} best={selected.id === recommended?.slug} signInHref={signInHref} />
          </> : selected.dex && swap && swap.kind !== "none" ? <SwapCard key={selected.id} asset={asset} network={network} amount={amount} option={swap} /> : selected.route ? <Route key={selected.id} route={selected.route} /> : null}
        </> : <div className={styles.empty}><TriangleAlert size={16} aria-hidden /><p><strong>Quote unavailable</strong>{swap?.kind === "none" ? swap.reason : pickupHint ?? "No provider covers this selection yet."}</p></div>}
      </aside>
      <div className={comparisonStyles.moreContext}>
        {destination === "INR" ? <NetworkSupportTable asset={asset} network={network} /> : null}
        {destination === "INR" ? <TaxTools /> : null}
        <p className={styles.footnote}>Railor doesn’t hold crypto, sign transactions or run swaps. Links open the provider; you confirm everything there, in your own account or wallet.</p>
      </div>
    </section>
  );
}

function CashOutDetails({ asset, currency, quote, reason }: { asset: Stablecoin; currency: CashOutCurrency; quote: CashOutQuote | null; reason?: string | null }) {
  const rail = CASH_OUT_RAILS[currency];
  return <article className={styles.card}>
    <h3 className={styles.cardTitle}>Kraken Pro · {rail.method}</h3>
    <dl className={styles.breakdown}>
      <div><dt>Account eligibility<small>{rail.availability}. {currency === "CHF" && asset === "USDT" ? "USDT trading is restricted for Liechtenstein accounts. " : ""}Check your account’s deposit and withdrawal options.</small></dt></div>
      <div><dt>Withdrawal minimum</dt><dd>{fiat(rail.minimum, currency)}</dd></div>
      <div><dt>Bank delivery estimate</dt><dd>{rail.timing}</dd></div>
      {quote ? <div><dt>Gross sale<small>{quote.averagePrice.toLocaleString("en", { maximumFractionDigits: 6 })} {currency} per {asset} from the order book</small></dt><dd>{fiat(quote.gross, currency)}</dd></div> : null}
      <div><dt>Trading fee<small>Kraken Pro entry-level taker rate</small></dt><dd>{quote ? fiat(quote.tradingFee, currency) : (KRAKEN_TAKER_RATE * 100).toFixed(2) + "%"}</dd></div>
      <div><dt>Bank withdrawal fee</dt><dd>{quote ? fiat(quote.withdrawalFee, currency) : rail.feeRate ? (rail.feeRate * 100).toFixed(2) + "%" : fiat(rail.flatFee, currency)}</dd></div>
      <div><dt>Wallet network fee<small>Depends on the sender’s wallet and network. Excluded from the estimate.</small></dt></div>
      <div><dt>Personal tax<small>Depends on tax residence, cost basis and how you acquired and held the token. Excluded from the estimate.</small></dt></div>
      {quote ? <div><dt>Estimated bank payout<small>After known charges, before personal tax</small></dt><dd>{fiat(quote.payout, currency)}</dd></div> : null}
    </dl>
    {reason ? <p className={styles.caution}><TriangleAlert size={14} aria-hidden />{reason}</p> : null}
    {quote ? <p className={styles.footnote}>Order book checked {new Date(quote.observedAt).toLocaleString()}.</p> : null}
    <p className={styles.footnote}>
      <a href={KRAKEN_FEES} target="_blank" rel="noreferrer noopener">Trading fees</a>{" · "}
      <a href={KRAKEN_WITHDRAWALS} target="_blank" rel="noreferrer noopener">Bank fees and delivery</a>{" · "}
      <a href={KRAKEN_NETWORKS} target="_blank" rel="noreferrer noopener">Deposit networks</a>
      {currency === "EUR" || currency === "CHF" ? <>{" · "}<a href={KRAKEN_EEA} target="_blank" rel="noreferrer noopener">EEA restrictions</a></> : null}
      {currency === "CAD" ? <>{" · "}<a href={KRAKEN_CANADA} target="_blank" rel="noreferrer noopener">Canadian account restrictions</a></> : null}
      {rail.taxGuide ? <>{" · "}<a href={rail.taxGuide.url} target="_blank" rel="noreferrer noopener">{rail.taxGuide.label}</a></> : null}
    </p>
  </article>;
}

function Route({ route }: { route: RouteCard }) {
  return (
    <article className={styles.route}>
      <header>
        <ProviderLogo slug={route.slug} name={route.provider} size={34} />
        <div><h3>{route.provider}</h3><p>{route.title}</p></div>
        <span className={styles.price} data-request={route.price === "Price on request" || undefined}>{route.price}</span>
      </header>
      <p className={styles.delivers}><ArrowRight size={14} aria-hidden />{route.delivers}</p>
      <ul className={styles.points}>{route.points.map((point) => <li key={point}><Check size={13} aria-hidden />{point}</li>)}</ul>
      {route.caution ? <p className={styles.caution}><TriangleAlert size={13} aria-hidden />{route.caution}</p> : null}
      <footer><span>{route.priceNote}</span><a href={route.sourceUrl} target="_blank" rel="noreferrer noopener">Source · checked {CHECKED} <ArrowUpRight size={11} /></a></footer>
    </article>
  );
}

function SwapCard({ asset, network, amount, option }: { asset: Stablecoin; network: Network; amount: number; option: Exclude<ReturnType<typeof swapOption>, { kind: "none" }> }) {
  const label = NETWORKS[network].label;
  return (
    <article className={styles.route} data-kind="dex">
      <header>
        <ProviderLogo slug={option.kind} name={option.name} size={34} />
        <div><h3>{option.name}</h3><p>Swap {asset} → EURC on {label}{option.kind === "titan" ? " (DEX aggregator)" : ""}</p></div>
        <span className={styles.price} data-request>Live rate on the DEX</span>
      </header>
      <ul className={styles.points}>
        {option.kind === "uniswap"
          ? <li><Check size={13} aria-hidden />Opens Uniswap with {asset} → EURC on {label}{amount > 0 ? ` and ${amount.toLocaleString("en-US")} ${asset} filled in` : ""}.</li>
          : <li><Check size={13} aria-hidden />Titan doesn’t document a prefilled link, so choose {asset} → EURC after it opens. Both token mints are below.</li>}
        <li><Check size={13} aria-hidden />You confirm in your own wallet. Check the rate, price impact and network fee first.</li>
        <li><Check size={13} aria-hidden />Token addresses come from {TOKENS[asset].issuer}’s and Circle’s own lists.</li>
      </ul>
      {option.kind === "titan" ? (
        <dl className={styles.mints}>
          {([[asset, option.mints.from], ["EURC", option.mints.to]] as const).map(([symbol, mint]) => (
            <div key={symbol}><dt><CurrencyLogo symbol={symbol} size={16} />{symbol} mint</dt><dd><code>{short(mint)}</code><button type="button" className={styles.copy} onClick={() => copy(mint, `${symbol} mint`)} aria-label={`Copy the ${symbol} mint`}><Copy size={12} /></button></dd></div>
          ))}
        </dl>
      ) : null}
      <a className={`${styles.cta} press`} href={option.url} target="_blank" rel="noreferrer noopener">
        {option.kind === "uniswap" ? "Open Uniswap, prefilled" : "Open Titan"}<ArrowUpRight size={16} aria-hidden />
      </a>
    </article>
  );
}
