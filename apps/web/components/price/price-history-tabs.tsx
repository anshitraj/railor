"use client";

import { useState } from "react";
import { ProviderHistoryChart } from "./provider-history-chart";
import { RateHistoryChart } from "./rate-history-chart";
import styles from "./provider-history.module.css";

/** History for a fiat pair: what arrived through each provider by day, or the plain exchange rate. */
export function PriceHistoryTabs({ from, to, amount, profile }: { from: string; to: string; amount: number; profile?: string }) {
  const [view, setView] = useState<"arrives" | "rate">("arrives");
  return (
    <div className={styles.tabsWrap}>
      <div className={styles.tabs} role="tablist" aria-label="History view">
        <button type="button" role="tab" aria-selected={view === "arrives"} onClick={() => setView("arrives")}>What arrives</button>
        <button type="button" role="tab" aria-selected={view === "rate"} onClick={() => setView("rate")}>Exchange rate</button>
      </div>
      <div role="tabpanel">
        {view === "arrives" ? <ProviderHistoryChart from={from} to={to} amount={amount} profile={profile} /> : <RateHistoryChart mode="bank" from={from} to={to} amount={amount} />}
      </div>
    </div>
  );
}
