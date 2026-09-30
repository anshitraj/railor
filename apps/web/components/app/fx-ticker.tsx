"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerRate } from "@railor/core";
import { cn } from "@railor/ui";

/**
 * Scrolling mid-market FX strip (Wise's public rate, refreshed every 60s).
 * Railor keeps no rate history, so the arrow shows movement since this page
 * started watching — never a made-up 24h change.
 */
export function FxTicker({ className = "" }: { className?: string }) {
  const [rates, setRates] = useState<TickerRate[]>([]);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const first = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    let loadedAt = 0;
    const load = async (force = false) => {
      // Polls pause while the tab is hidden; the first load and a return to the tab never wait.
      if (!force && (document.visibilityState !== "visible" || Date.now() - loadedAt < 55_000)) return;
      try {
        const res = await fetch("/api/prices/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { rates: TickerRate[] };
        if (!alive) return;
        loadedAt = Date.now();
        const next: Record<string, number> = {};
        for (const r of body.rates) {
          const key = `${r.from}${r.to}`;
          first.current[key] ??= r.rate;
          next[key] = (r.rate / first.current[key]! - 1) * 100;
        }
        setMoves(next);
        setRates(body.rates);
      } catch {
        /* offline: keep the last strip */
      }
    };
    void load(true);
    const timer = window.setInterval(() => void load(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!rates.length) return <div className={cn("h-9", className)} aria-hidden />;
  const items = [...rates, ...rates];
  return (
    // contain: inline-size — the scrolling strip never widens the page it sits in.
    <div className={cn("relative w-full overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] [contain:inline-size]", className)} aria-label="Mid-market FX rates">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[var(--color-surface)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[var(--color-surface)] to-transparent" />
      <ul className="railor-marquee flex w-max items-center gap-7 px-4 py-2">
        {items.map((r, i) => {
          const move = moves[`${r.from}${r.to}`] ?? 0;
          return (
            <li key={`${r.from}${r.to}-${i}`} aria-hidden={i >= rates.length} className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px]">
              <span className="font-bold text-[var(--color-ink)]">
                {r.from}/{r.to}
              </span>
              <span className="tabular text-[var(--color-ink-soft)]">{r.rate.toLocaleString("en-US", { maximumSignificantDigits: 6 })}</span>
              {Math.abs(move) >= 0.005 ? (
                <span className={cn("tabular text-[11px] font-semibold", move > 0 ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]")} title="Change since you opened this page">
                  {move > 0 ? "▲" : "▼"} {Math.abs(move).toFixed(2)}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
