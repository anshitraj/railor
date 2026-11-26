"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { RefreshCw } from "lucide-react";
import type { ProviderHistory, ProviderHistoryDay } from "../../lib/provider-history";
import { ProviderLogo } from "../app/provider-logo";
import { PriceLoadingMark } from "./price-loading-mark";
import styles from "./provider-history.module.css";

const RANGES = [[7, "1W"], [30, "1M"], [90, "3M"]] as const;
type Range = (typeof RANGES)[number][0];
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
/** Index of the last item matching, or -1 (Array#findLastIndex without needing ES2023 types). */
function lastIndexWhere<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) if (test(items[index]!)) return index;
  return -1;
}
const dateLabel = (date: string, long = false) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", long ? { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" });

interface Series { best: Array<number | null>; bank: Array<number | null>; mid: Array<number | null>; bestName: Array<string | null>; bankName: Array<string | null>; bankIsBank: boolean[] }

/** Per day: the most that arrived, the least a bank paid (or the least any option paid, where no bank was priced), and the mid-market value. */
function seriesOf(days: ProviderHistoryDay[]): Series {
  const out: Series = { best: [], bank: [], mid: [], bestName: [], bankName: [], bankIsBank: [] };
  for (const day of days) {
    const best = day.quotes[0] ?? null;
    const banks = day.quotes.filter((quote) => quote.category === "bank");
    const low = banks.length ? banks.at(-1)! : day.quotes.length > 1 ? day.quotes.at(-1)! : null;
    out.best.push(best?.recipientAmount ?? null);
    out.bestName.push(best?.providerName ?? null);
    out.bank.push(low?.recipientAmount ?? null);
    out.bankName.push(low?.providerName ?? null);
    out.bankIsBank.push(banks.length > 0);
    out.mid.push(day.midMarket);
  }
  return out;
}

/** Path segments that break wherever a day has no value. */
function segments(values: Array<number | null>, x: (index: number) => number, y: (value: number) => number): string[] {
  const paths: string[] = [];
  let current = "";
  values.forEach((value, index) => {
    if (value === null) { if (current) paths.push(current); current = ""; return; }
    current += `${current ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
  });
  if (current) paths.push(current);
  return paths;
}

/** The shaded gap between what the best option and a bank paid, per run of days that have both. */
function bands(top: Array<number | null>, bottom: Array<number | null>, x: (index: number) => number, y: (value: number) => number): string[] {
  const out: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) {
      const upper = run.map((index) => `${x(index).toFixed(2)},${y(top[index]!).toFixed(2)}`);
      const lower = [...run].reverse().map((index) => `${x(index).toFixed(2)},${y(bottom[index]!).toFixed(2)}`);
      out.push(`M${upper.join("L")}L${lower.join("L")}Z`);
    }
    run = [];
  };
  top.forEach((value, index) => { if (value !== null && bottom[index] !== null && bottom[index] !== value) run.push(index); else flush(); });
  flush();
  return out;
}

export function ProviderHistoryChart({ from, to, amount, profile = "personal" }: { from: string; to: string; amount: number; profile?: string }) {
  const [range, setRange] = useState<Range>(30);
  const key = new URLSearchParams({ from, to, amount: String(amount), profile, days: String(range) }).toString();
  const [response, setResponse] = useState<{ key: string; data?: ProviderHistory; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/prices/provider-history?" + key, { signal: controller.signal }).then(async (res) => {
      const body = await res.json();
      if (!res.ok || !Array.isArray(body.days)) throw new Error(body.error ?? "Price history couldn’t load.");
      if (!controller.signal.aborted) setResponse({ key, data: body });
    }).catch((error) => { if (!controller.signal.aborted) setResponse({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, retry]);

  const data = response?.key === key ? response.data : undefined;
  const error = response?.key === key ? response.error : undefined;

  return (
    <section className={styles.chart} aria-label={`What arrives from ${from} to ${to}, by day`} aria-busy={!data && !error}>
      <header className={styles.header}>
        <div>
          <h2>{to} received for {data ? whole(data.amount) : whole(amount)} {from}, after fees</h2>
          <p>{data && data.amount !== data.requested ? `Closest amount Railor has recorded to ${whole(data.requested)} ${from}, ${profile} prices.` : `Each day Railor priced this transfer for a ${profile} customer, by provider.`}</p>
        </div>
        <div className={styles.periods} role="group" aria-label="History range">
          {RANGES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={range === value} aria-label={`Last ${value} days`} onClick={() => { if (range !== value) { setResponse(null); setRange(value); } }}>{label}</button>
          ))}
        </div>
      </header>
      {!data && !error ? <div className={styles.state} role="status"><PriceLoadingMark />Loading recorded prices…</div>
        : error || !data ? <div className={styles.state} role="status"><strong>History unavailable</strong><p>{error}</p><button type="button" onClick={() => { setResponse(null); setRetry((value) => value + 1); }}><RefreshCw size={14} />Try again</button></div>
          : <Plot key={key} data={data} />}
    </section>
  );
}

function Plot({ data }: { data: ProviderHistory }) {
  const id = useId();
  const { days, from, to } = data;
  const series = useMemo(() => seriesOf(days), [days]);
  const lastQuoted = lastIndexWhere(days, (day) => day.quotes.length > 0);
  const lastAny = lastIndexWhere(days, (day) => day.quotes.length > 0 || day.midMarket !== null);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const selected = hover ?? pinned ?? (lastQuoted >= 0 ? lastQuoted : Math.max(0, lastAny));
  const day = days[selected]!;

  const values = [...series.best, ...series.bank, ...series.mid].filter((value): value is number => value !== null);
  if (!values.length) {
    return <div className={styles.state} role="status"><strong>No prices recorded yet</strong><p>Railor keeps a daily record of what each provider pays for this transfer from the first time it’s checked. Come back tomorrow to see the first days.</p></div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.12, max * 0.002);
  const low = min - pad;
  const high = max + pad;
  const x = (index: number) => days.length === 1 ? 50 : (index / (days.length - 1)) * 100;
  const y = (value: number) => (1 - (value - low) / (high - low)) * 100;
  const ticks = Array.from({ length: 4 }, (_, index) => low + ((high - low) * (index + 0.5)) / 4);
  const dateTicks = Array.from({ length: 4 }, (_, index) => Math.round((index * (days.length - 1)) / 3));
  const inspect = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(days.length - 1, Math.round(((clientX - rect.left) / rect.width) * (days.length - 1))));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    setHover(null);
    setPinned((current) => {
      const at = current ?? selected;
      if (event.key === "Home") return 0;
      if (event.key === "End") return days.length - 1;
      return Math.max(0, Math.min(days.length - 1, at + (event.key === "ArrowLeft" ? -1 : 1)));
    });
  };
  const best = series.best[selected];
  const bank = series.bank[selected];
  const gap = best != null && bank != null ? best - bank : null;
  const lastIndex = (values: Array<number | null>) => lastIndexWhere(values, (value) => value !== null);
  type EndLabel = { kind: "best" | "mid" | "bank"; label: string; top: number };
  const labelled: Array<[EndLabel["kind"], string]> = [["best", "Cheapest option"], ["mid", "Mid-market rate"], ["bank", series.bankIsBank.some(Boolean) ? "With a bank" : "Lowest option"]];
  const endLabels = labelled
    .map(([kind, label]): EndLabel | null => { const values = series[kind]; const at = lastIndex(values); return at < 0 ? null : { kind, label, top: y(values[at]!) }; })
    .filter((item): item is EndLabel => item !== null)
    .sort((a, b) => a.top - b.top);
  // Keep end labels from overlapping.
  for (let index = 1; index < endLabels.length; index += 1) endLabels[index]!.top = Math.max(endLabels[index]!.top, endLabels[index - 1]!.top + 9);

  const recorded = days.filter((item) => item.quotes.length).length;
  return (
    <>
      <dl className={styles.legend} aria-live="polite">
        <div className={styles.legendDate}><dt className="sr-only">Date</dt><dd>{dateLabel(day.date, true)}</dd></div>
        <div data-series="mid"><dt><i />Mid-market</dt><dd>{day.midMarket === null ? "—" : `${money(day.midMarket)}`}</dd></div>
        <div data-series="best"><dt><i />{series.bestName[selected] ?? "Cheapest"}</dt><dd>{best == null ? "Not recorded" : money(best)}</dd></div>
        <div data-series="bank"><dt><i />{series.bankName[selected] ?? (series.bankIsBank[selected] ? "Bank" : "Lowest option")}</dt><dd>{bank == null ? "Not recorded" : money(bank)}</dd></div>
        <div data-series="gap"><dt><i />{series.bankIsBank[selected] ? "Extra cost of a bank" : "Cost of the worst option"}</dt><dd>{gap === null ? "—" : money(gap)}</dd></div>
      </dl>

      <div className={styles.frame}>
        <div className={styles.yAxis} aria-hidden="true">{ticks.map((tick) => <span key={tick} style={{ top: `${y(tick)}%` }}>{whole(tick)}</span>)}</div>
        <div
          className={styles.plot}
          tabIndex={0}
          role="group"
          aria-label={`Chart of ${to} received by day. Use the arrow keys to move between days.`}
          onKeyDown={onKey}
          onPointerDown={(event) => { if (event.pointerType === "touch") { event.currentTarget.setPointerCapture(event.pointerId); setPinned(inspect(event.clientX, event.currentTarget)); } }}
          onPointerMove={(event) => {
            const index = inspect(event.clientX, event.currentTarget);
            if (event.pointerType === "touch") { if (event.buttons === 1) setPinned(index); } else setHover(index);
          }}
          onPointerLeave={() => setHover(null)}
          onClick={(event) => setPinned(inspect(event.clientX, event.currentTarget))}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.graph} aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-band`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--color-orange)" stopOpacity=".16" /><stop offset="1" stopColor="var(--color-orange)" stopOpacity=".1" /></linearGradient>
            </defs>
            {ticks.map((tick) => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className={styles.grid} />)}
            {bands(series.best, series.bank, x, y).map((d) => <path key={d} d={d} fill={`url(#${id}-band)`} />)}
            {segments(series.mid, x, y).map((d) => <path key={d} d={d} className={styles.mid} />)}
            {segments(series.bank, x, y).map((d) => <path key={d} d={d} className={styles.bank} />)}
            {segments(series.best, x, y).map((d) => <path key={d} d={d} className={styles.best} />)}
          </svg>
          {/* Single recorded days have no line to sit on, so they show as dots. */}
          {(["best", "bank"] as const).flatMap((kind) => series[kind].map((value, index) => value !== null && series[kind][index - 1] == null && series[kind][index + 1] == null
            ? <i key={`${kind}-${index}`} className={styles.dot} data-series={kind} style={{ left: `${x(index)}%`, top: `${y(value)}%` }} /> : null))}
          <i className={styles.cursor} style={{ left: `${x(selected)}%` }} />
          {(["mid", "bank", "best"] as const).map((kind) => series[kind][selected] == null ? null : <i key={kind} className={styles.marker} data-series={kind} style={{ left: `${x(selected)}%`, top: `${y(series[kind][selected]!)}%` }} />)}
          {hover !== null || pinned !== null ? <Tip day={day} to={to} series={series} index={selected} x={x(selected)} y={y} /> : null}
        </div>
        <ul className={styles.endLabels} aria-hidden="true">{endLabels.map((item) => <li key={item.kind} data-series={item.kind} style={{ top: `${item.top}%` }}>{item.label}</li>)}</ul>
        <div className={styles.xAxis} aria-hidden="true">{dateTicks.map((index) => <span key={index}>{dateLabel(days[index]!.date)}</span>)}</div>
      </div>

      <DayTable day={day} from={from} to={to} />
      <footer className={styles.note}>
        <p>{recorded ? `${recorded} of ${days.length} days recorded` : "No provider prices recorded in this period yet"} · from Railor’s own checks of public prices, fees included. Days Railor didn’t check are left empty, never filled in. Mid-market from <a href={data.reference.sourceUrl} target="_blank" rel="noreferrer noopener">{data.reference.source}</a>.</p>
      </footer>
    </>
  );
}

/**
 * The price beside the pointer: the day, and what each line paid that day. It
 * sits above the highest point (below it when that is near the top) and leans
 * away from the plot's edges, so it never covers the cursor or leaves the chart.
 */
function Tip({ day, to, series, index, x, y }: { day: ProviderHistoryDay; to: string; series: Series; index: number; x: number; y: (value: number) => number }) {
  type TipRow = { kind: "best" | "mid" | "bank"; label: string; value: number };
  const rows: TipRow[] = [];
  const add = (kind: TipRow["kind"], label: string, value: number | null | undefined) => { if (value !== null && value !== undefined) rows.push({ kind, label, value }); };
  add("best", series.bestName[index] ?? "Cheapest", series.best[index]);
  add("mid", "Mid-market", series.mid[index]);
  add("bank", series.bankName[index] ?? (series.bankIsBank[index] ? "Bank" : "Lowest option"), series.bank[index]);
  const heights = rows.map((row) => y(row.value));
  const top = heights.length ? Math.min(...heights) : null;
  const bottom = heights.length ? Math.max(...heights) : null;
  const above = top === null || top > 40;
  const side = x > 62 ? "calc(-100% - 14px)" : x < 38 ? "14px" : "-50%";
  const style = { left: `${x}%`, top: `${above ? (top ?? 8) : bottom}%`, transform: `translate(${side}, ${above ? (top === null ? "0" : "calc(-100% - 16px)") : "16px"})` };
  return (
    <div className={styles.tip} style={style} aria-hidden="true">
      <time dateTime={day.date}>{dateLabel(day.date, true)}</time>
      {rows.length ? rows.map(({ kind, label, value }) => (
        <div key={kind} data-series={kind}><span><i />{label}</span><strong>{money(value)} {to}</strong></div>
      )) : <span className={styles.tipEmpty}>Not recorded this day</span>}
    </div>
  );
}

function DayTable({ day, from, to }: { day: ProviderHistoryDay; from: string; to: string }) {
  const [all, setAll] = useState(false);
  const quotes = all ? day.quotes : day.quotes.slice(0, 6);
  const best = day.quotes[0]?.recipientAmount ?? null;
  return (
    <div className={styles.table} role="region" aria-label={`Prices on ${dateLabel(day.date, true)}`} tabIndex={0}>
      <table>
        <thead>
          <tr><th scope="col">{dateLabel(day.date, true)}</th><th scope="col">Exchange rate</th><th scope="col">Fee</th><th scope="col">Recipient gets</th><th scope="col">vs mid-market</th></tr>
        </thead>
        <tbody>
          <tr data-row="mid">
            <th scope="row"><span className={styles.midIcon} aria-hidden="true">···</span>Mid-market rate</th>
            <td>{day.midMarketRate === null ? "—" : day.midMarketRate.toFixed(4)}</td>
            <td>—</td>
            <td><strong>{day.midMarket === null ? "—" : `${money(day.midMarket)} ${to}`}</strong></td>
            <td />
          </tr>
          {quotes.map((quote) => {
            const difference = day.midMarket === null ? null : quote.recipientAmount - day.midMarket;
            return (
              <tr key={quote.providerSlug} data-best={quote.recipientAmount === best || undefined}>
                <th scope="row">
                  <ProviderLogo slug={quote.providerSlug} name={quote.providerName} size={28} />
                  <span>{quote.providerName}</span>
                  {quote.recipientAmount === best ? <em className={styles.cheapest}>Cheapest</em> : null}
                  {quote.basis === "market_estimate" ? <em className={styles.estimate} title="A comparison feed’s estimate, not the provider’s own quote">Estimate</em> : null}
                </th>
                <td>{quote.rate === null ? "—" : quote.rate.toFixed(4)}</td>
                <td>{quote.fee === null ? "—" : quote.fee === 0 ? "Free" : `${money(quote.fee)} ${quote.feeCurrency ?? from}`}</td>
                <td><strong>{money(quote.recipientAmount)} {to}</strong></td>
                <td data-sign={difference === null ? undefined : difference > 0.004 ? "up" : difference < -0.004 ? "down" : "same"}>{difference === null ? "—" : Math.abs(difference) < 0.005 ? "Same" : `${difference > 0 ? "+" : "−"}${money(Math.abs(difference))}`}</td>
              </tr>
            );
          })}
          {!day.quotes.length ? <tr><td colSpan={5} className={styles.empty}>Railor didn’t price this transfer on this day.</td></tr> : null}
        </tbody>
      </table>
      {day.quotes.length > 6 ? <button type="button" className={styles.more} onClick={() => setAll((value) => !value)}>{all ? "Show fewer" : `Show all ${day.quotes.length} providers`}</button> : null}
    </div>
  );
}
