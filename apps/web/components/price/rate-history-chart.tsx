"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { HISTORY_RANGES, type HistoryDays, type HistoryRequest, type RateHistory } from "../../lib/rate-history";
import { PriceLoadingMark } from "./price-loading-mark";
import styles from "./rate-history.module.css";

const dateLabel = (date: string, year = false) => new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const format = (value: number, digits: number) => value.toLocaleString("en-US", { maximumFractionDigits: digits });
const rangeLabels: Record<HistoryDays, string> = { 7: "1W", 30: "1M", 90: "3M", 365: "1Y" };

export function RateHistoryChart({ amount, ...request }: HistoryRequest & { amount: number }) {
  const ranges = HISTORY_RANGES[request.mode];
  const [range, setRange] = useState<HistoryDays>(request.days ?? 7);
  const days = ranges.some(item => item === range) ? range : 7;
  const params = new URLSearchParams({ mode: request.mode, from: request.from, to: request.to, days: String(days) });
  if (request.provider) params.set("provider", request.provider);
  if (request.network) params.set("network", request.network);
  const key = params.toString();
  const [response, setResponse] = useState<{ key: string; data?: RateHistory; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/prices/history?" + key, { signal: controller.signal }).then(async (res) => {
      const body = await res.json();
      if (!res.ok || !Array.isArray(body.points) || body.points.length !== days) throw new Error(body.error ?? "Historical rates couldn’t load.");
      if (!controller.signal.aborted) setResponse({ key, data: body });
    }).catch((error) => { if (!controller.signal.aborted) setResponse({ key, error: error.message }); });
    return () => controller.abort();
  }, [days, key, retry]);

  const data = response?.key === key ? response.data : undefined;
  const error = response?.key === key ? response.error : undefined;
  const hasRates = data?.points.some(point => point.rate !== null);

  return <section className={styles.chart} aria-label={request.from + " to " + request.to + " rate history"} aria-busy={!data && !error}>
    <header className={styles.header}>
      <div><h2>{request.from} <span>/</span> {request.to}</h2><p>Daily exchange rate</p></div>
      <div className={styles.periods} role="group" aria-label="History range">
        {ranges.map(value => <button key={value} type="button" aria-pressed={days === value} aria-label={"Last " + value + " days"} onClick={() => { if (days !== value) { setResponse(null); setRange(value); } }}>{rangeLabels[value]}</button>)}
      </div>
    </header>
    {!data && !error ? <div className={styles.state} role="status"><PriceLoadingMark />Loading daily rates…</div> : error || !hasRates ? <div className={styles.state} role="status">
      <strong>{error ? "History unavailable" : "No observations for this period"}</strong><p>{error ?? "The source has yet to publish rates for these dates."}</p>
      <button type="button" onClick={() => { setResponse(null); setRetry(value => value + 1); }}><RefreshCw size={14} />Try again</button>
    </div> : data ? <HistoryPlot key={key} data={data} amount={amount} id={id} /> : null}
    {data && <footer><a href={data.sourceUrl} target="_blank" rel="noreferrer noopener">{data.source}<ArrowUpRight size={12} aria-hidden /></a><p>{data.note}</p></footer>}
  </section>;
}

function HistoryPlot({ data, amount, id }: { data: RateHistory; amount: number; id: string }) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { points, from, to } = data;
  const available = points.flatMap(({ rate, date }, index) => rate === null ? [] : [{ rate, date, index }]);
  const first = available[0]!;
  const latest = available.at(-1)!;
  const selectedIndex = hover ?? pinned ?? latest.index;
  const selected = points[selectedIndex]!;
  const min = Math.min(...available.map(point => point.rate));
  const max = Math.max(...available.map(point => point.rate));
  const change = available.length > 1 ? (latest.rate / first.rate - 1) * 100 : null;
  const span = Math.max(max - min, max * .001);
  const approximateStep = span / 3;
  const unit = 10 ** Math.floor(Math.log10(approximateStep));
  const step = ([1, 2, 2.5, 5, 10].find(value => unit * value >= approximateStep) ?? 10) * unit;
  const low = Math.max(0, Math.floor((min - step * .18) / step) * step);
  const tickCount = Math.ceil((max + step * .18 - low) / step);
  const high = low + step * tickCount;
  const tickDigits = Math.max(0, -Math.floor(Math.log10(step)) + (Math.abs(step / unit - 2.5) < .01 ? 1 : 0));
  const digits = Math.min(12, tickDigits + 1);
  const rateLabel = (value: number) => format(value, digits);
  const x = (index: number) => 1.5 + index * (97 / (points.length - 1));
  const y = (rate: number) => (1 - (rate - low) / (high - low)) * 100;
  const yAt = selected.rate === null ? null : y(selected.rate);
  const guideLeft = x(selectedIndex) + "%";
  const guideTop = yAt === null ? undefined : yAt + "%";
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => low + step * index);
  const dateTicks = Array.from({ length: 4 }, (_, index) => Math.round(index * (points.length - 1) / 3));
  const inspect = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(points.length - 1, Math.round(((clientX - rect.left) / rect.width * 100 - 1.5) / 97 * (points.length - 1))));
  };
  const segments: { x: number; y: number; index: number }[][] = [];
  for (const point of available) {
    const segment = segments.at(-1);
    const coordinate = { x: x(point.index), y: y(point.rate), index: point.index };
    if (segment?.at(-1)?.index === point.index - 1) segment.push(coordinate);
    else segments.push([coordinate]);
  }
  return <>
    <div className={styles.metric}>
      <div className={styles.readout}>
        <span>{dateLabel(selected.date, true)} · UTC</span>
        <strong>{selected.rate === null ? "No observation" : <>{rateLabel(selected.rate)} <small>{to}</small></>}</strong>
      </div>
      {change !== null && <div className={styles.performance}><span data-change={change < 0 ? "down" : "up"}>{change > 0 ? "+" : ""}{change.toFixed(2)}%</span><small>Period change</small></div>}
      <p>{selected.rate !== null && amount > 0 ? <>1 {from} = {rateLabel(selected.rate)} {to} · {format(amount, 2)} {from} ≈ {format(amount * selected.rate, 2)} {to}</> : selected.rate === null ? "No published rate for this date." : <>Rate per 1 {from}</>}</p>
    </div>
    <div className={styles.chartGrid}>
      <div className={styles.plot}
        onPointerDown={event => { if (event.pointerType === "touch") event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => {
          const index = inspect(event.clientX, event.currentTarget);
          if (event.pointerType !== "touch") setHover(index);
          else if (event.buttons === 1) { setHover(null); setPinned(index); }
        }}
        onPointerLeave={() => setHover(null)}
        onClick={event => setPinned(inspect(event.clientX, event.currentTarget))}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.graph} role="img" aria-labelledby={id + "-title"} aria-describedby={id + "-desc"}>
          <title id={id + "-title"}>{from} to {to} daily exchange rates</title>
          <desc id={id + "-desc"}>Published rates with gaps for missing days. Use the date slider or daily rates table to inspect exact rates.</desc>
          <defs><linearGradient id={id + "-area"} x2="0" y2="1"><stop stopColor="var(--color-orange)" stopOpacity=".18" /><stop offset="100%" stopColor="var(--color-orange)" stopOpacity="0" /></linearGradient></defs>
          {ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className={styles.gridline} />)}
          {dateTicks.map(index => <line key={index} x1={x(index)} x2={x(index)} y1="0" y2="100" className={styles.gridline} />)}
          {segments.map(segment => {
            if (segment.length < 2) return null;
            const line = "M" + segment.map(point => point.x + "," + point.y).join(" L");
            return <g key={segment[0]!.index}><path d={line + " L" + segment.at(-1)!.x + ",100 L" + segment[0]!.x + ",100 Z"} fill={"url(#" + id + "-area)"} /><path d={line} className={styles.line} /></g>;
          })}
        </svg>
        {segments.filter(segment => segment.length === 1).map(([point]) => <i key={point!.index} className={styles.point} style={{ left: point!.x + "%", top: point!.y + "%" }} />)}
        <i className={styles.vertical} style={{ left: guideLeft }} />
        {guideTop && <><i className={styles.horizontal} style={{ top: guideTop }} /><i className={styles.activePoint} style={{ left: guideLeft, top: guideTop }} /></>}
      </div>
      <div className={styles.priceAxis} aria-hidden="true">
        {ticks.map(tick => <span key={tick} style={{ top: y(tick) + "%" }}>{format(tick, tickDigits)}</span>)}
        {guideTop && selected.rate !== null && <strong style={{ top: guideTop }}>{rateLabel(selected.rate)}</strong>}
      </div>
      <div className={styles.timeAxis} aria-hidden="true">{dateTicks.map(index => <span key={index}>{dateLabel(points[index]!.date)}</span>)}</div>
    </div>
    <label className={styles.scrub}>
      <span>Inspect day</span>
      <input type="range" min={0} max={points.length - 1} value={selectedIndex} onChange={event => { setHover(null); setPinned(Number(event.currentTarget.value)); }} aria-valuetext={dateLabel(selected.date, true) + ", " + (selected.rate === null ? "no observation" : rateLabel(selected.rate) + " " + to + " per " + from)} />
    </label>
    <details className={styles.table}><summary>Daily rates</summary><div tabIndex={0} role="region" aria-label="Daily rates table"><table><thead><tr><th>Date (UTC)</th><th>{to} per {from}</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{dateLabel(point.date, true)}</td><td>{point.rate === null ? "No observation" : rateLabel(point.rate)}</td></tr>)}</tbody></table></div></details>
  </>;
}
