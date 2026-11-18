"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Flag } from "@railor/ui";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { CASH_OUT_CURRENCIES, CASH_PICKUP_CURRENCIES, DESTINATIONS, NETWORKS, TOKENS, isCashOutCurrency, isCashPickupCurrency, networksFor, type Destination, type Network, type Stablecoin } from "../../lib/stablecoin-routes";
import priceStyles from "./price.module.css";
import styles from "./stablecoin.module.css";

type Asset = Stablecoin | Destination;
type Props = { network: Network } & (
  | { side: "from"; value: Stablecoin; onChange: (asset: Stablecoin, network: Network) => void }
  | { side: "to"; value: Destination; onChange: (destination: Destination) => void }
);

function ChainIcon({ network, size }: { network: Network; size: number }) {
  // Aptos is the only supported chain without a mark in the shared logo set.
  if (network === "aptos") return <img src="/brand/networks/aptos.svg" width={size} height={size} alt="Aptos" />;
  return <NetworkLogo slug={network} size={size} />;
}

function fiatFlag(asset: Asset) {
  return asset === "INR" ? "IN" : isCashOutCurrency(asset) ? CASH_OUT_CURRENCIES[asset].flag : isCashPickupCurrency(asset) ? CASH_PICKUP_CURRENCIES[asset].flag : undefined;
}

function AssetIcon({ asset, network }: { asset: Asset; network?: Network }) {
  const flag = fiatFlag(asset);
  return <span className={styles.tokenIcon} aria-hidden>
    {flag ? <Flag code={flag} size={26} round /> : <CurrencyLogo symbol={asset} size={26} />}
    {network && !flag ? <span className={styles.networkBadge}><ChainIcon network={network} size={13} /></span> : null}
  </span>;
}

/** Select the token and its network together; a draft never changes the live route. */
export function StablecoinPicker(props: Props) {
  const { side, value, network } = props;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Asset>(value);
  const [query, setQuery] = useState("");
  const [networkQuery, setNetworkQuery] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const label = side === "from" ? "Sending asset" : "Receive destination";
  const subtitle = isCashPickupCurrency(value) ? "Cash pickup" : fiatFlag(value) ? "Bank account" : NETWORKS[network].label;
  const options: Asset[] = side === "from" ? ["USDT", "USDC"] : DESTINATIONS;
  const filtered = options.filter((asset) => {
    const names = asset === "INR" ? "Indian rupee bank account" : isCashOutCurrency(asset) ? CASH_OUT_CURRENCIES[asset].name + " bank account" : isCashPickupCurrency(asset) ? CASH_PICKUP_CURRENCIES[asset].name + " cash pickup" : `${TOKENS[asset].issuer} ${asset === "EURC" ? "Euro" : "USD"}`;
    return `${asset} ${names}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const draftToken = draft === "USDC" ? "USDC" : "USDT";
  const filteredNetworks = networksFor(draftToken).filter(chain => (chain + " " + NETWORKS[chain].label).toLowerCase().includes(networkQuery.trim().toLowerCase()));
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = side === "from" ? 620 : 340;
      const height = side === "from" ? 545 : 480;
      setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height)), left: Math.max(12, Math.min(rect.right - 340, window.innerWidth - width - 12)) });
    };
    place();
    search.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", place);
    return () => { document.body.style.overflow = previous; window.removeEventListener("resize", place); };
  }, [open, side]);

  const chooseNetwork = (asset: Stablecoin, chain: Network) => {
    if (props.side === "from") props.onChange(asset, chain);
    close();
  };
  const chooseToken = (asset: Asset) => {
    setDraft(asset);
    if (props.side === "to") { props.onChange(asset as Destination); close(); }
    else setNetworkQuery("");
  };

  return <>
    <button ref={trigger} type="button" className={`${priceStyles.pickerTrigger} ${styles.assetPill} press`} aria-label={`${label}: ${value} · ${subtitle}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { setDraft(value); setQuery(""); setNetworkQuery(""); setOpen(true); }}>
      <AssetIcon asset={value} network={network} />
      <span className={styles.pillText}>{value}<span className={styles.pillNetwork}><span className={styles.pillDot}> · </span>{subtitle}</span></span>
      <ChevronDown size={14} aria-hidden className={priceStyles.pickerChevron} />
    </button>
    {open ? createPortal(<div className={styles.pickerLayer}>
      <div className={styles.assetScrim} onClick={close} aria-hidden />
      <div ref={panel} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className={`${priceStyles.pickerPanel} ${styles.assetPanel}`} data-split={side === "from" || undefined} style={position} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") {
          const focusable = panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input");
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <header className={styles.pickerHeading}><h3 id={`${id}-title`}>{side === "from" ? "Choose token & network" : "Choose destination"}</h3><button type="button" onClick={close} aria-label="Close asset picker"><X size={18} /></button></header>
        <div className={styles.pickerColumns}>
          <section className={styles.assetPane} aria-label={side === "from" ? "Choose token" : "Receive currencies"}>
            <label className={priceStyles.pickerSearch}><Search size={16} aria-hidden /><input ref={search} aria-label={side === "to" ? "Search currencies" : "Search tokens"} placeholder={side === "to" ? "Search currencies" : "Search tokens"} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div className={styles.assetOptions}>
              <p className={priceStyles.pickerGroup}>{side === "from" ? "Stablecoins" : "Receive as"}</p>
              {filtered.map((asset) => <div key={asset}>
                <button type="button" className={`${priceStyles.pickerOption} ${styles.tokenOption}`} data-active={draft === asset || undefined} aria-pressed={(side === "from" ? draft : value) === asset} aria-controls={side === "from" ? id + "-networks" : undefined} onClick={() => chooseToken(asset)}>
                  <AssetIcon asset={asset} />
                  <span className={styles.tokenName}><strong>{asset}</strong><small>{asset === "INR" ? "Indian rupee · Bank account" : isCashOutCurrency(asset) ? CASH_OUT_CURRENCIES[asset].name + " · Bank account" : isCashPickupCurrency(asset) ? CASH_PICKUP_CURRENCIES[asset].name + " · Cash pickup" : asset === "EURC" ? `On-chain · ${NETWORKS[network].label}` : TOKENS[asset].issuer}</small></span>
                  {side === "from" ? <ChevronRight size={15} aria-hidden /> : value === asset ? <Check size={16} className={priceStyles.pickerCheck} aria-label="Selected" /> : null}
                </button>
              </div>)}
              {!filtered.length ? <p className={priceStyles.pickerEmpty}>No matching options.</p> : null}
            </div>
          </section>
          {side === "from" ? <section className={styles.networkPane} id={id + "-networks"} aria-labelledby={id + "-network-title"}>
            <h4 id={id + "-network-title"}>{draftToken} networks</h4>
            <label className={priceStyles.pickerSearch}><Search size={16} aria-hidden /><input aria-label="Search networks" placeholder="Search networks" value={networkQuery} onChange={(event) => setNetworkQuery(event.target.value)} /></label>
            <div className={styles.networkOptions}>
              {filteredNetworks.map(chain => <button type="button" key={chain} aria-label={NETWORKS[chain].label} aria-pressed={value === draftToken && network === chain} onClick={() => chooseNetwork(draftToken, chain)}>
                <ChainIcon network={chain} size={23} /><span>{NETWORKS[chain].label}</span>{value === draftToken && network === chain ? <Check size={15} aria-hidden /> : null}
              </button>)}
              {!filteredNetworks.length && <p className={priceStyles.pickerEmpty}>No matching networks.</p>}
            </div>
          </section> : null}
        </div>
        {side === "to" ? <p className={styles.pickerHint}>EURC swaps use your sending network. Change it in “You have”.</p> : <p className={styles.pickerHint}>Only networks listed by the token’s issuer.</p>}
      </div>
    </div>, document.body) : null}
  </>;
}
