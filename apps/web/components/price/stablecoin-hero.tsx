"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Landmark, LockKeyhole, ShieldCheck } from "lucide-react";
import { CurrencyLogo } from "../marketing/currency-logo";
import { ProviderLogo } from "../app/provider-logo";
import { vdaTax, type ExchangeQuote } from "../../lib/india-exchanges";
import { NETWORKS, TOKENS, networksFor, type Network, type Stablecoin } from "../../lib/stablecoin-routes";
import { inr, useExchangeQuotes } from "./stablecoin-inr";
import priceStyles from "./price.module.css";
import styles from "./stablecoin.module.css";

const PRESETS = [500, 1000, 5000];

/**
 * The homepage's stablecoin calculator: USDT or USDC on a network, sold on an
 * Indian exchange. Signed out, the amount stays blurred — the server sends no
 * number — and a tap opens sign-in.
 */
export function StablecoinHero({ signedIn }: { signedIn: boolean }) {
  const [asset, setAsset] = useState<Stablecoin>("USDT");
  const [networkChoice, setNetwork] = useState<Network>("ethereum");
  const networks = networksFor(asset);
  const network = networks.includes(networkChoice) ? networkChoice : networks[0]!;
  const [amountText, setAmountText] = useState("1000");
  const amount = Number(amountText) || 0;
  const { data, loading, error } = useExchangeQuotes(asset, network, amount, true);

  const best = data && !data.locked ? (data.exchanges.find((quote) => quote.status === "priced") as ExchangeQuote | undefined) : undefined;
  const tax = best?.breakdown ? vdaTax(best.breakdown, null) : null;
  const query = new URLSearchParams({ mode: "stablecoin", asset, network, dest: "INR", amount: String(amount || 1000) });
  const fullHref = signedIn ? `/app/prices?${query}` : `/prices?${query}`;
  const signInHref = `/login?intent=start&next=${encodeURIComponent(`/app/prices?${query}`)}`;
  const locked = !signedIn || data?.locked === true;

  return (
    <div className={priceStyles.quote} data-variant="hero">
      <div className={`${priceStyles.card} ${styles.heroCard}`}>
        <div className={priceStyles.progress} data-active={loading || undefined} aria-hidden />
        <div className={styles.head}>
          <div role="group" aria-label="Stablecoin" className={styles.segment}>
            {(["USDT", "USDC"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={asset === value} onClick={() => setAsset(value)}>
                <CurrencyLogo symbol={value} size={18} />{value}
              </button>
            ))}
          </div>
          <span className={styles.checked}><ShieldCheck size={13} aria-hidden />Live exchange order books</span>
        </div>

        <div className={styles.block}>
          <span className={styles.label} id="hero-network">Network it’s on</span>
          <div role="radiogroup" aria-labelledby="hero-network" className={styles.heroChips}>
            {networks.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={network === value} className={`${styles.chip} press`} onClick={() => setNetwork(value)}>
                <i aria-hidden style={{ background: NETWORKS[value].color }} />{NETWORKS[value].label}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>You sell</span>
          <span className={styles.amountRow}>
            <input inputMode="decimal" value={amountText} aria-label={`Amount in ${asset}`} onChange={(event) => setAmountText(event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 11))} />
            <span className={styles.assetTag}><CurrencyLogo symbol={asset} size={20} />{asset}</span>
          </span>
        </label>
        <div className={priceStyles.presets} role="group" aria-label="Quick amounts">
          {PRESETS.map((preset) => (
            <button key={preset} type="button" className="press" aria-pressed={amount === preset} onClick={() => setAmountText(String(preset))}>{preset.toLocaleString("en-US")}</button>
          ))}
        </div>

        <div className={styles.heroOut}>
          <span className={styles.label}><Landmark size={13} aria-hidden /> In your Indian bank, after fees and 1% TDS</span>
          {locked ? (
            <Link href={signInHref} className={styles.heroLocked} aria-label="Sign in to see how much INR arrives">
              <strong className={styles.blurred} aria-hidden>₹00,000.00</strong>
              <span className={styles.lockBadgeInline}><LockKeyhole size={13} aria-hidden />Sign in to see the full price</span>
            </Link>
          ) : best?.breakdown ? (
            <>
              <strong className={styles.heroAmount}>{inr(best.breakdown.inBank)}</strong>
              <p className={styles.heroVia}>
                <ProviderLogo slug={best.slug} name={best.name} size={18} /> via <b>{best.name}</b> at ₹{best.fill!.averagePrice.toFixed(2)} / {asset}
                {tax ? <> · after 30% tax at most {inr(tax.afterTax)}</> : null}
              </p>
            </>
          ) : (
            <strong className={styles.heroAmount}>{error ? "—" : "…"}</strong>
          )}
        </div>

        <Link href={fullHref} className={`${styles.cta} press`}>
          {locked ? "See every route" : "See fees, TDS and tax"}<ArrowRight size={16} aria-hidden />
        </Link>
        <p className={styles.heroFoot}>{TOKENS[asset].issuer}’s {asset} on {NETWORKS[network].label}. CoinDCX and WazirX are compared; Railor never holds your crypto.</p>
      </div>
    </div>
  );
}
