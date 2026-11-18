"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import type { UsdtInrExchangeRates } from "@railor/core";
import { clockTime, rupees, signedPercent, type LiveView, type RatesState } from "../../lib/exchange-live";
import styles from "./stablecoin.module.css";

/** The server shares a reading for 15s; polling faster than this only repeats it. */
const POLL_MS = 30_000;
/** Bids older than this are dropped from the screen when the poll keeps failing. */
const KEEP_MS = 90_000;

/**
 * The live USDT/INR bids for signed-in users (`/api/prices/exchanges`),
 * polled while the tab is visible. `enabled` is false for visitors and for any
 * selection with no exchange cards, so those never call the route.
 */
export function useExchangeRates(enabled: boolean): RatesState {
  const [state, setState] = useState<RatesState>({ status: "idle", data: null });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let loadedAt = 0;
    const load = async (force = false) => {
      if (!force && (document.visibilityState !== "visible" || Date.now() - loadedAt < POLL_MS - 2_000)) return;
      setState((current) => (current.status === "ready" ? current : { status: "loading", data: null }));
      try {
        const response = await fetch("/api/prices/exchanges", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as UsdtInrExchangeRates;
        if (!alive) return;
        loadedAt = Date.now();
        setState({ status: "ready", data });
      } catch {
        // A failed poll keeps the last reading for a minute and a half, then shows the failure instead of an old price.
        if (alive) setState((current) => (current.status === "ready" && Date.now() - Date.parse(current.data.generatedAt) < KEEP_MS ? current : { status: "error", data: null }));
      }
    };
    void load(true);
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return state;
}

/** One exchange card's live-price slot. */
export function ExchangeLive({ view, amount, signInHref }: { view: LiveView; amount: number; signInHref: string }) {
  switch (view.kind) {
    case "locked":
      return (
        <Link href={signInHref} className={styles.liveLocked} aria-label="Sign in to see this exchange’s live USDT price">
          {/* A fixed stand-in, never a real number: the price stays on the server until the visitor signs in. */}
          <span aria-hidden className={styles.liveBlurred}>₹0,00,000</span>
          <span className={styles.liveBadge}><LockKeyhole size={13} aria-hidden />Sign in to see the live price</span>
        </Link>
      );
    case "loading":
      return <p className={styles.liveNone} data-loading>Reading the live price…</p>;
    case "failed":
      return <p className={styles.liveNone}>Live prices didn’t load. Trying again shortly.</p>;
    case "no-feed":
      return <p className={styles.liveNone}><strong>No live price.</strong> {view.reason}.</p>;
    case "unavailable":
      return <p className={styles.liveNone}><strong>Live price unavailable.</strong> {view.detail}</p>;
    case "ok": {
      const { bid, reference, estimate, fee } = view;
      const when = clockTime(bid.observedAt);
      const whose = bid.clock === "exchange" ? "the exchange’s own timestamp" : "when Railor read it; this exchange sends no time";
      return (
        <div className={styles.live} aria-live="off">
          {estimate ? (
            <div className={styles.liveTop}>
              <span className={styles.liveLabel}>For {amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT you’d get about</span>
              <strong className={styles.liveAmount}>{rupees(estimate.net)}</strong>
            </div>
          ) : null}
          <dl className={styles.liveFacts}>
            <div>
              <dt>Best bid</dt>
              <dd>{rupees(bid.bid, 2)} per USDT{when ? <small title={`Time from ${whose}`}> · {bid.clock === "exchange" ? "as of" : "read at"} {when}</small> : null}</dd>
            </div>
            {bid.gapPct !== null && reference ? (
              <div>
                <dt>Against Wise mid-market</dt>
                <dd>{signedPercent(bid.gapPct)}<small> of ₹{reference.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} per USD</small></dd>
              </div>
            ) : null}
          </dl>
          {estimate ? (
            <details className={styles.liveMath}>
              <summary>How this is worked out</summary>
              <dl>
                <div><dt>{amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT × {rupees(bid.bid, 2)}</dt><dd>{rupees(estimate.gross, 2)}</dd></div>
                <div><dt>Trading fee {fee.pct}%{fee.gstIncluded ? ", GST included" : ""}</dt><dd>−{rupees(estimate.fee, 2)}</dd></div>
                {fee.gstIncluded ? null : <div><dt>GST 18% on the fee</dt><dd>−{rupees(estimate.gst, 2)}</dd></div>}
                <div><dt>TDS 1% of the sale after fees</dt><dd>−{rupees(estimate.tds, 2)}</dd></div>
                <div><dt>Left in your exchange account</dt><dd>{rupees(estimate.net, 2)}</dd></div>
              </dl>
            </details>
          ) : null}
          <p className={styles.liveNote}>Market reference, not a quote. Priced at the best bid, so a bigger sale can fill lower; the INR withdrawal fee comes off after.</p>
        </div>
      );
    }
  }
}
