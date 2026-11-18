"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { HistoryRequest, RateHistory } from "../../lib/rate-history";
import styles from "./rate-history.module.css";

const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 4 });

export function RateHistoryChart({ amount, ...request }: HistoryRequest & { amount: number }) {
  const params = new URLSearchParams({ mode: request.mode, from: request.from, to: request.to, ...(request.provider ? { provider: request.provider } : {}), ...(request.network ? { network: request.network } : {}) });
  const key = params.toString();
  const [response, setResponse] = useState<{ key: string; data?: RateHistory; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setActive(null);
    void fetch(`/api/prices/history?${key}`, { signal: controller.signal }).then(async (res) => {
      const body = await res.json();
      if (!res.ok || !Array.isArray(body.points) || body.points.length !== 7) throw new Error(body.error ?? "Historical rates couldn’t load.");
      if (!controller.signal.aborted) setResponse({ key, data: body });
    }).catch((error) => { if (!controller.signal.aborted) setResponse({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, retry]);
  const data = response?.key === key ? response.data : undefined;
  const error = response?.key === key ? response.error : undefined;
  const available = data?.points.flatMap((point, index) => point.rate !== null ? [{ ...point, index }] : []) ?? [];
  const latest = available[available.length - 1];
  const selected = data?.points[active ?? latest?.index ?? 6];
  const rates = available.map((point) => point.rate!);
  const min = rates.length ? Math.min(...rates) : 0;
  const max = rates.length ? Math.max(...rates) : 1;
  const range = Math.max(max - min, max * .002, .00001);
  const low = min - range * .2;
  const high = max + range * .2;
  const x = (index: number) => 28 + index * (424 / 6);
  const y = (rate: number) => 152 - (rate - low) / (high - low) * 120;
  let penDown = false;
  const line = data?.points.map((point, index) => {
    if (point.rate === null) { penDown = false; return ""; }
    const command = penDown ? "L" : "M"; penDown = true;
    return `${command}${x(index)},${y(point.rate)}`;
  }).join(" ");
  const first = available[0];
  const change = first && latest && first.index !== latest.index ? ((latest.rate! / first.rate!) - 1) * 100 : null;
  const value = selected?.rate;

  return <section className={styles.chart} aria-label={`${request.from} to ${request.to} seven-day history`} aria-busy={!response}>
    <header><div><h2>Last 7 days</h2><p>{request.from} → {request.to}{request.network ? ` · ${request.network === "optimism" ? "OP Mainnet" : request.network.charAt(0).toUpperCase() + request.network.slice(1)}` : ""}</p></div><span className={styles.period}>7D</span></header>
    {!data && !error ? <div className={styles.state} role="status"><RefreshCw size={18} className={styles.loading} />Loading daily rates…</div> : error || !available.length ? <div className={styles.state} role="status"><strong>{error ? "History unavailable" : "No observations in the last 7 days"}</strong><p>{error ?? "The source hasn’t published usable daily rates for this pair. Missing prices aren’t estimated."}</p><button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={13} />Try again</button></div> : data ? <>
      <div className={styles.metric} aria-live="polite"><span>{selected ? dateLabel(selected.date) : ""} · daily rate</span><strong>{value != null ? <>1 {request.from} = {money(value)} {request.to}</> : "No observation"}</strong><small>{value != null && amount > 0 ? <>{money(amount)} {request.from} ≈ {money(amount * value)} {request.to} before fees</> : "No published rate for this date"}</small></div>
      <svg viewBox="0 0 480 180" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} className={styles.plot} onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(6, Math.round((((event.clientX - box.left) / box.width) * 480 - 28) / (424 / 6))))); }} onPointerLeave={() => setActive(null)}>
        <title id={`${id}-title`}>{request.from}/{request.to} daily rates over the last seven days</title><desc id={`${id}-desc`}>Published market rates only. Gaps represent missing observations. Use the date buttons or daily rates table for exact values.</desc>
        {[32, 92, 152].map((position) => <line key={position} x1="28" x2="452" y1={position} y2={position} className={styles.grid} />)}
        <path d={line} className={styles.line} />
        {selected && selected.rate !== null ? <line x1={x(active ?? latest!.index)} x2={x(active ?? latest!.index)} y1="20" y2="162" className={styles.guide} /> : null}
        {data.points.map((point, index) => point.rate === null ? null : <circle key={point.date} cx={x(index)} cy={y(point.rate)} r={index === (active ?? latest?.index) ? 5 : 3.5} className={styles.dot}><title>{dateLabel(point.date)}: {money(point.rate)} {request.to}</title></circle>)}
      </svg>
      <div className={styles.days} role="group" aria-label="Inspect a day">{data.points.map((point, index) => <button type="button" key={point.date} aria-pressed={index === (active ?? latest?.index)} aria-label={`${dateLabel(point.date)}: ${point.rate === null ? "No observation" : `${money(point.rate)} ${request.to} per ${request.from}`}`} onFocus={() => setActive(index)} onClick={() => setActive(index)}>{dateLabel(point.date)}</button>)}</div>
      {change !== null ? <p className={styles.change}>{change >= 0 ? "+" : ""}{change.toFixed(2)}% between the first and latest available observations</p> : null}
      <details className={styles.table}><summary>View daily rates</summary><table><thead><tr><th>Date (UTC)</th><th>{request.to} per {request.from}</th></tr></thead><tbody>{data.points.map((point) => <tr key={point.date}><td>{dateLabel(point.date)}</td><td>{point.rate === null ? "No observation" : money(point.rate)}</td></tr>)}</tbody></table></details>
    </> : null}
    {data ? <footer><a href={data.sourceUrl} target="_blank" rel="noreferrer noopener">{data.source}<ArrowUpRight size={11} /></a><p>{data.note}</p></footer> : null}
  </section>;
}
