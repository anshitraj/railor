"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Copy, Info, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { CurrencyLogo } from "../marketing/currency-logo";
import { ProviderLogo } from "../app/provider-logo";
import { toast } from "../toast";
import { ALL_NETWORKS, NETWORKS, STABLECOIN_CHECKED, TOKENS, notIssuedReason, stablecoinRoutes, swapOption, type Destination, type Network, type RouteCard, type Stablecoin } from "../../lib/stablecoin-routes";
import { IndiaExchangePanel, NetworkSupportTable, TaxTools } from "./stablecoin-inr";
import styles from "./stablecoin.module.css";

const ASSETS: Stablecoin[] = ["USDT", "USDC"];
const DESTINATIONS: Array<{ value: Destination; label: string; hint: string }> = [
  { value: "INR", label: "INR in my bank", hint: "Off-ramp to an Indian bank account" },
  { value: "EURC", label: "EURC, on-chain", hint: "Swap and stay in crypto" },
];
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

/**
 * Stablecoin routes: pick the coin and the network it sits on, then where it
 * should end up. Off-ramps show what's verified and "Price on request" — never
 * a 1:1 conversion — and swaps open the DEX itself, prefilled where the DEX
 * documents how.
 */
export function StablecoinQuote({ initial, locked = false }: { initial: { asset: Stablecoin; network: Network | null; destination: Destination; amount: number }; locked?: boolean }) {
  const reduce = useReducedMotion();
  const [asset, setAsset] = useState<Stablecoin>(initial.asset);
  const [network, setNetwork] = useState<Network>(initial.network ?? "ethereum");
  const issued = Boolean(TOKENS[asset].addresses[network]);
  const [destination, setDestination] = useState<Destination>(initial.destination);
  const [amountText, setAmountText] = useState(String(initial.amount));
  const amount = Number(amountText) || 0;

  const routes = useMemo(() => (issued ? stablecoinRoutes(asset, network, destination, amount) : []), [issued, asset, network, destination, amount]);
  const swap = useMemo(() => (destination === "EURC" && issued ? swapOption(asset, network, amount) : null), [issued, asset, network, destination, amount]);
  const exchangeCount = destination === "INR" && issued ? 2 : 0;
  const count = routes.length + exchangeCount + (swap && swap.kind !== "none" ? 1 : 0);
  const query = new URLSearchParams({ mode: "stablecoin", asset, network, dest: destination, amount: String(amount || 1000) });
  const signInHref = `/login?intent=start&next=${encodeURIComponent(`/app/prices?${query}`)}`;
  const item = (index: number) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, transition: { duration: 0.12 } }, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const, delay: index * 0.05 } });

  return (
    <section className={styles.wrap} aria-labelledby="stablecoin-title">
      <div className={styles.card}>
        <div className={styles.head}>
          <h2 id="stablecoin-title" className="sr-only">Stablecoin routes</h2>
          <div role="group" aria-label="Stablecoin" className={styles.segment}>
            {ASSETS.map((value) => (
              <button key={value} type="button" aria-pressed={asset === value} onClick={() => setAsset(value)}>
                <CurrencyLogo symbol={value} size={18} />{value}
              </button>
            ))}
          </div>
          <span className={styles.checked} title="Token addresses, fees and route facts re-read from each issuer’s and provider’s own pages">
            <ShieldCheck size={13} aria-hidden />Sources checked {CHECKED}
          </span>
        </div>

        <div className={styles.block}>
          <span className={styles.label} id="network-label">Network it’s on</span>
          <div role="radiogroup" aria-labelledby="network-label" className={styles.chips}>
            {ALL_NETWORKS.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={network === value} className={`${styles.chip} press`} data-unissued={!TOKENS[asset].addresses[value] || undefined} title={TOKENS[asset].addresses[value] ? undefined : `${TOKENS[asset].issuer} doesn’t issue ${asset} on ${NETWORKS[value].label}`} onClick={() => setNetwork(value)}>
                <i aria-hidden style={{ background: NETWORKS[value].color }} />{NETWORKS[value].label}
              </button>
            ))}
          </div>
          {issued ? (
            <p className={styles.address}>
              {asset} on {NETWORKS[network].label}: <code>{short(TOKENS[asset].addresses[network]!)}</code>
              <button type="button" className={styles.copy} onClick={() => copy(TOKENS[asset].addresses[network]!, `${asset} address`)} aria-label={`Copy the ${asset} address on ${NETWORKS[network].label}`}><Copy size={12} /></button>
              <a href={TOKENS[asset].source} target="_blank" rel="noreferrer noopener">{TOKENS[asset].issuer}’s list <ArrowUpRight size={11} /></a>
            </p>
          ) : (
            <p className={styles.caution}><TriangleAlert size={13} aria-hidden />{notIssuedReason(asset, network)}</p>
          )}
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>You have</span>
            <span className={styles.amountRow}>
              <input inputMode="decimal" value={amountText} aria-label={`Amount in ${asset}`} onChange={(event) => setAmountText(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} />
              <span className={styles.assetTag}><CurrencyLogo symbol={asset} size={20} />{asset}</span>
            </span>
          </label>
          <div className={styles.field}>
            <span className={styles.label} id="destination-label">You want</span>
            <div role="radiogroup" aria-labelledby="destination-label" className={styles.destinations}>
              {DESTINATIONS.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={destination === option.value} className="press" onClick={() => setDestination(option.value)}>
                  <strong>{option.label}</strong><small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className={styles.parity}><Info size={14} aria-hidden />Railor doesn’t treat 1 {asset} as 1 USD. Each stablecoin trades at its own price; the provider or DEX shows the real rate before you confirm.</p>
      </div>

      <div className={styles.results} aria-live="polite">
        <p className={styles.resultsHead}><strong>{count} verified {count === 1 ? "route" : "routes"}</strong> for {asset} on {NETWORKS[network].label} → {destination === "INR" ? "INR" : "EURC"}</p>
        {locked && destination === "INR" && issued ? (
          <Link href={signInHref} className={styles.lockBanner}><LockKeyhole size={15} aria-hidden /><span><strong>Sign in to see what arrives</strong>Exchange prices, fees, TDS and tax are for free accounts.</span><ArrowRight size={15} aria-hidden /></Link>
        ) : null}
        {destination === "INR" ? <IndiaExchangePanel asset={asset} network={network} amount={amount} issued={issued} locked={locked} signInHref={signInHref} /> : null}
        {destination === "INR" && routes.length ? <h3 className={styles.subhead}>Payment platforms and issuers</h3> : null}
        <ul className={styles.list}>
          <AnimatePresence initial={false} mode="popLayout">
            {swap ? <motion.li key={`swap:${asset}:${network}:${swap.kind}`} {...item(0)} layout={!reduce}>
              {swap.kind === "none" ? <div className={styles.empty}><TriangleAlert size={16} aria-hidden /><p><strong>No swap on {NETWORKS[network].label}</strong>{swap.reason}</p></div> : <SwapCard asset={asset} network={network} amount={amount} option={swap} />}
            </motion.li> : null}
            {routes.map((route, index) => (
              <motion.li key={`${route.id}:${asset}:${destination}`} {...item(index + (swap ? 1 : 0))} layout={!reduce}><Route route={route} /></motion.li>
            ))}
            {!routes.length && !swap && !exchangeCount ? <motion.li key="none" {...item(0)}><div className={styles.empty}><TriangleAlert size={16} aria-hidden /><p><strong>No verified route yet</strong>{issued ? "Nothing from a first-party source covers this combination." : notIssuedReason(asset, network)}</p></div></motion.li> : null}
          </AnimatePresence>
        </ul>
        {destination === "INR" ? <NetworkSupportTable asset={asset} network={network} /> : null}
        {destination === "INR" ? <TaxTools /> : null}
        <p className={styles.footnote}>Railor doesn’t hold crypto, sign transactions or run swaps. Links open the provider; you confirm everything there, in your own account or wallet.</p>
      </div>
    </section>
  );
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
