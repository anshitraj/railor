"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowLeftRight, ArrowUpRight, ChevronDown, Info, RefreshCw, Search, Tag } from "lucide-react";
import type { CustomerContext, PriceBasis, PriceCheckResult, PriceRow } from "@railor/core";
import { Flag, cn, type PickerOption } from "@railor/ui";
import { fallbackFill } from "../marketing/logo-fallback";
import { ProviderLogo } from "./provider-logo";
import { PlatformQuotePanel } from "./platform-quote-panel";
import { connectionProviderSlug, priceSourceTime, providerConnectionPath } from "../../lib/connection-navigation";

/**
 * A swap-style live quote: pick what you send and what they receive, and
 * every provider's price streams in, re-quoted every REFRESH_SECONDS. The
 * best actionable price is selected by default; any row can be picked.
 * Every number keeps its basis label — a published schedule or a market
 * estimate is never dressed up as a live quote.
 */

const REFRESH_SECONDS = 20;
const PRESETS = [
  { value: 100, label: "100" },
  { value: 1_000, label: "1K" },
  { value: 10_000, label: "10K" },
  { value: 50_000, label: "50K" },
];

const BASIS: Record<PriceBasis, { label: string; cls: string; hint: string }> = {
  exact: { label: "Your account", cls: "bg-emerald-400/15 text-emerald-300", hint: "A live quote from your own connected account — the price you'd pay." },
  live_public: { label: "Public reference", cls: "bg-sky-400/15 text-sky-300", hint: "A public API observation, not your business's executable quote. Your account's price can differ." },
  published: { label: "Published", cls: "bg-amber-300/15 text-amber-200", hint: "The provider's published fee schedule at the mid-market rate — not a quote." },
  market_estimate: { label: "Estimate", cls: "bg-white/10 text-white/60", hint: "Consumer pricing collected by Wise from the provider's site, dated." },
};

function money(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rateText(n: number) {
  return n.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

/** Eases a displayed number toward its new value so live updates read as movement, not flicker. */
function useTween(target: number | null, ms = 450) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const start = current.current;
    if (target === null || start === null || start === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = start + (target - start) * (1 - (1 - k) ** 3);
      current.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function CurrencyBadge({ code, symbol, flag, size = 26 }: { code: string; symbol?: string; flag?: string; size?: number }) {
  // The issuing country's flag, round like a token logo; the symbol circle is only the fallback.
  if (flag) {
    return (
      <span className="inline-flex shrink-0 rounded-full ring-2 ring-black/25" style={{ width: size, height: size }}>
        <Flag code={flag} size={size} round />
      </span>
    );
  }
  const glyph = (symbol || code.charAt(0)).slice(0, 3);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: fallbackFill(code, 3), fontSize: size * (glyph.length > 1 ? 0.34 : 0.5) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-black/25"
    >
      {glyph}
    </span>
  );
}

function CurrencySelect({ label, value, options, onChange }: { label: string; value: string; options: PickerOption[]; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const selected = options.find((o) => o.value === value);
  const list = options.filter((o) => !query || `${o.value} ${o.label}`.toLowerCase().includes(query.toLowerCase())).slice(0, 80);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-1.5 pr-3 text-[15px] font-semibold text-white transition hover:bg-white/[0.12]"
      >
        <CurrencyBadge code={value} symbol={selected?.emoji} flag={selected?.flag} />
        {value}
        <ChevronDown size={15} className={cn("text-white/60 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(300px,80vw)] rounded-2xl border border-white/10 bg-[#1b1a18] p-2 shadow-[0_18px_50px_rgba(0,0,0,.45)]">
          <label className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-white/60">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search currency"
              aria-label="Search currency"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/40"
            />
          </label>
          <ul role="listbox" aria-label={label} className="mt-1.5 max-h-72 overflow-y-auto">
            {list.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition hover:bg-white/[0.07]", o.value === value && "bg-white/[0.08]")}
                >
                  <CurrencyBadge code={o.value} symbol={o.emoji} flag={o.flag} size={24} />
                  <span className="font-semibold text-white">{o.value}</span>
                  <span className="truncate text-white/50">{o.label.split(" — ")[1] ?? ""}</span>
                </button>
              </li>
            ))}
            {!list.length ? <li className="px-3 py-4 text-[12.5px] text-white/50">No currency matches.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One-click alternatives next to a currency selector (the most-used currencies). */
function QuickPicks({ options, exclude, onPick }: { options: PickerOption[]; exclude: string[]; onPick: (code: string) => void }) {
  return (
    <div className="hidden items-center -space-x-1 sm:flex">
      {options
        .filter((o) => !exclude.includes(o.value))
        .slice(0, 3)
        .map((o) => (
          <button key={o.value} type="button" title={o.label} aria-label={`Use ${o.value}`} onClick={() => onPick(o.value)} className="rounded-full transition hover:z-10 hover:-translate-y-0.5">
            <CurrencyBadge code={o.value} symbol={o.emoji} flag={o.flag} size={22} />
          </button>
        ))}
    </div>
  );
}

function RefreshRing({ elapsed, loading, onClick }: { elapsed: number; loading: boolean; onClick: () => void }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" onClick={onClick} aria-label="Refresh quotes now" title={`Refreshes every ${REFRESH_SECONDS}s`} className="relative grid size-9 place-items-center rounded-full text-white/70 transition hover:bg-white/[0.08] hover:text-white">
      <svg viewBox="0 0 28 28" className="absolute inset-0 size-9 -rotate-90" aria-hidden>
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgb(255 255 255 / .1)" strokeWidth="2" />
        <circle cx="14" cy="14" r={r} fill="none" stroke="#ffad8c" strokeWidth="2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, elapsed / REFRESH_SECONDS))} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
      </svg>
      <RefreshCw size={14} className={cn(loading && "animate-spin")} />
    </button>
  );
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 2 ? "just now" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

export interface SwapQuoteProps {
  mode: "app" | "public";
  basePath: string;
  currencies: PickerOption[];
  initial: { from: string; to: string; amount: number; market: boolean; context: CustomerContext };
  initialResult: PriceCheckResult | null;
  initialError?: string;
  /** Providers Railor can execute payouts through. */
  executable: string[];
  /** Providers this workspace has a production connection for. */
  connected: string[];
}

export function SwapQuote({ mode, basePath, currencies, initial, initialResult, initialError, executable, connected }: SwapQuoteProps) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [amountText, setAmountText] = useState(String(initial.amount));
  const [market, setMarket] = useState(initial.market);
  const [context, setContext] = useState(initial.context);
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  // Both clocks start at the server's quote time so server and client render the same markup.
  const serverTime = Date.parse(initialResult?.generatedAt ?? "") || 0;
  const [fetchedAt, setFetchedAt] = useState(serverTime);
  const [now, setNow] = useState(serverTime);
  const [picked, setPicked] = useState<string | null>(null);
  const [inverted, setInverted] = useState(false);
  const [flashes, setFlashes] = useState<Record<string, "up" | "down">>({});
  const controller = useRef<AbortController | null>(null);
  const previous = useRef<Record<string, number>>({});
  const firstRun = useRef(true);

  const amount = Number(amountText);
  const valid = Boolean(from && to && from !== to && amount > 0);

  const load = useCallback(async () => {
    if (!valid) return;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoading(true);
    const q = new URLSearchParams({ from, to, amount: String(amount), market: market ? "1" : "0", ...context });
    try {
      const res = await fetch(`/api/prices?${q}`, { signal: ctl.signal, cache: "no-store" });
      const body = (await res.json()) as PriceCheckResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Price check failed (HTTP ${res.status}).`);
      // Flash rows whose price moved since the last poll of the same request.
      const moves: Record<string, "up" | "down"> = {};
      for (const row of body.rows) {
        const before = previous.current[row.providerSlug];
        if (before !== undefined && row.recipientAmount !== null && row.recipientAmount !== before) moves[row.providerSlug] = row.recipientAmount > before ? "up" : "down";
      }
      previous.current = Object.fromEntries(body.rows.flatMap((r) => (r.recipientAmount === null ? [] : [[r.providerSlug, r.recipientAmount]])));
      setFlashes(moves);
      setResult(body);
      setError("");
      setFetchedAt(Date.now());
      window.history.replaceState(null, "", `${basePath}?${q}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        // A failure waits out the same cycle as a success — never a tight retry loop.
        setFetchedAt(Date.now());
      }
    } finally {
      if (controller.current === ctl) setLoading(false);
    }
  }, [valid, from, to, amount, market, context, basePath]);

  // Re-quote on any input change (typing waits a beat); a new pair resets the flash baseline.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      previous.current = Object.fromEntries((initialResult?.rows ?? []).flatMap((r) => (r.recipientAmount === null ? [] : [[r.providerSlug, r.recipientAmount]])));
      return;
    }
    previous.current = {};
    setPicked(null);
    const t = window.setTimeout(load, 380);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, amountText, market, context]);

  // The clock: re-quote every REFRESH_SECONDS while the tab is visible.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!loading && valid && document.visibilityState === "visible" && now - fetchedAt >= REFRESH_SECONDS * 1000) void load();
  }, [now, fetchedAt, loading, valid, load]);

  useEffect(() => {
    if (!Object.keys(flashes).length) return;
    const t = window.setTimeout(() => setFlashes({}), 1500);
    return () => window.clearTimeout(t);
  }, [flashes]);

  const contextCurrent = result?.input.context && JSON.stringify(result.input.context) === JSON.stringify(context);
  const visible = (r: PriceRow) => r.profileAssessment?.status !== "not_supported";
  const quotes = result?.rows.filter((r) => r.basis !== "market_estimate" && visible(r)) ?? [];
  const unavailable = result?.unavailable.filter(u => !result.platformQuotes?.some(check => check.providerSlug === u.providerSlug && check.status === "quoted")) ?? [];
  const estimates = result?.rows.filter((r) => r.basis === "market_estimate" && visible(r)) ?? [];
  const excluded = result?.rows.filter((r) => r.profileAssessment?.status === "not_supported") ?? [];
  const best = quotes.find((r) => r.shortfall === 0) ?? null;
  const selected = result?.rows.find((r) => r.providerSlug === picked && visible(r)) ?? best ?? quotes[0] ?? estimates[0] ?? null;
  const receive = useTween(selected?.recipientAmount ?? null);
  const midValue = result?.reference ? amount * result.reference.rate : null;
  const rate = selected?.rate ?? result?.reference?.rate ?? null;
  const elapsed = (now - fetchedAt) / 1000;
  const sym = (code: string) => currencies.find((c) => c.value === code)?.emoji;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const cta = (() => {
    if (!valid) return { label: from === to ? "Pick two different currencies" : "Enter an amount", disabled: true as const };
    if (!selected) return { label: loading ? "Fetching quotes…" : "No quote for this pair", disabled: true as const };
    if (!contextCurrent || context.direction === "receive" || selected.profileAssessment?.status !== "documented" || !selected.profileAssessment.priceApplicable) {
      return { label: `Account options for ${selected.providerName}`, href: providerConnectionPath(selected.providerSlug, mode) };
    }
    if (mode === "public") {
      return { label: "Compare provider features", href: "#provider-features" };
    }
    if (selected.basis === "market_estimate") return { label: `Connection options for ${selected.providerName}`, href: providerConnectionPath(selected.providerSlug) };
    const sendWith = (row: PriceRow, extra?: { secondary: { label: string; href: string; external?: boolean } }) => {
      const params = new URLSearchParams({ from, to, amount: String(amount), provider: row.providerSlug });
      return connected.includes(row.providerSlug)
        ? { label: `Send with ${row.providerName}`, href: `/app/payments/new?${params}`, ...extra }
        : { label: `Connect ${row.providerName} to send`, href: providerConnectionPath(row.providerSlug), secondary: extra?.secondary ?? { label: "or simulate it in test mode", href: `/app/payments/new?${params}` } };
    };
    if (executable.includes(selected.providerSlug)) return sendWith(selected);
    // The best price may sit with a provider that has no API: say so, and offer the best one Railor can send through.
    const alternative = quotes.find((r) => executable.includes(r.providerSlug));
    const sourceKind = selected.basis === "live_public" ? "public pricing" : "published pricing";
    const openIt = selected.source.url ? { label: `or view ${selected.providerName}'s ${sourceKind} ↗`, href: selected.source.url, external: true } : undefined;
    if (alternative) {
      const primary = sendWith(alternative, openIt ? { secondary: openIt } : undefined);
      return { ...primary, label: `${primary.label} · ${money(alternative.recipientAmount)} ${to}` };
    }
    return openIt ? { label: `View ${selected.providerName}'s ${sourceKind}`, href: openIt.href, external: true } : { label: `${selected.providerName} isn't integrated for execution yet`, disabled: true as const };
  })();

  return (
    <div className="flex flex-col gap-3">
      <section className="product-dark p-3 sm:p-4" aria-label="Price comparison">
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-[12px] font-semibold text-[#ffad8c]">
              <span className="relative flex size-2">
                <span className="relative inline-flex size-2 rounded-full bg-[#ffad8c]" />
              </span>
              Price observations
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={market}
                onClick={() => setMarket((m) => !m)}
                title="Add consumer prices collected by Wise's comparison feed"
                className={cn("rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition", market ? "border-[#ffad8c]/50 bg-[#ffad8c]/10 text-[#ffad8c]" : "border-white/10 text-white/60 hover:text-white")}
              >
                {market ? "Market estimates on" : "+ Market estimates"}
              </button>
              <RefreshRing elapsed={elapsed} loading={loading} onClick={() => void load()} />
            </div>
          </div>

          <div role="group" aria-label="Account type" className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
            <span className="text-[12px] font-medium text-white/60">I’m {context.direction === "receive" ? "receiving" : "sending"} as</span>
            <div className="inline-flex rounded-full border border-white/15 bg-white/[0.03] p-1">
              {([{ value: "business", label: "Business" }, { value: "freelancer", label: "Freelancer" }, { value: "personal", label: "Personal" }] as const).map((option) => {
                const active = context.profile === option.value || (option.value === "freelancer" && context.profile === "sole_proprietor");
                return <button key={option.value} type="button" aria-pressed={active}
                  onClick={() => setContext((c) => ({ ...c, profile: option.value, purpose: option.value === "personal" ? "personal" : c.purpose === "personal" ? "services" : c.purpose }))}
                  className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold transition", active ? "bg-[#ffad8c]/15 text-[#ffad8c]" : "text-white/60 hover:text-white")}>
                  {option.label}
                </button>;
              })}
            </div>
            {!contextCurrent ? <span role="status" className="sr-only">Checking this profile…</span> : null}
          </div>

          <div className="relative flex flex-col gap-1.5">
            <div className="rounded-2xl border border-[#f5c451]/45 bg-white/[0.04] p-4 transition focus-within:border-[#f5c451]/80 focus-within:bg-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="swap-amount" className="text-[12.5px] font-medium text-white/60">
                  {context.direction === "receive" ? "Your client sends" : "You send"}
                </label>
                <div className="flex gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setAmountText(String(p.value))}
                      className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold transition", amount === p.value ? "text-[#f5c451]" : "text-white/45 hover:text-white")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="swap-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 12))}
                  className="min-w-0 flex-1 bg-transparent font-display text-[clamp(1.7rem,6vw,2.25rem)] font-semibold tracking-tight text-white outline-none placeholder:text-white/25"
                  placeholder="0"
                />
                <QuickPicks options={currencies} exclude={[from, to]} onPick={setFrom} />
                <CurrencySelect label="Send currency" value={from} options={currencies} onChange={(c) => (c === to ? swap() : setFrom(c))} />
              </div>
              <p className="mt-2 text-[12px] text-white/45">{midValue !== null ? `≈ ${money(midValue)} ${to} at the mid-market rate` : " "}</p>
            </div>

            <button
              type="button"
              onClick={swap}
              aria-label="Swap currencies"
              className="absolute left-1/2 top-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#22211f] bg-[#34322e] text-white/80 transition hover:rotate-180 hover:text-white"
            >
              <ArrowDownUp size={15} />
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-white/60">{context.direction === "receive" ? "You receive" : "They receive"}{selected?.partial ? " · reference amount" : ""}</span>
                {selected ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-white/55">
                    via <ProviderLogo slug={selected.providerSlug} name={selected.providerName} src={selected.logoUrl} size={16} /> <span className="font-semibold text-white/80">{selected.providerName}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <output
                  aria-live="polite"
                  className={cn(
                    "min-w-0 flex-1 truncate font-display text-[clamp(1.7rem,6vw,2.25rem)] font-semibold tracking-tight tabular text-white",
                    selected && flashes[selected.providerSlug] === "up" && "railor-flash-up",
                    selected && flashes[selected.providerSlug] === "down" && "railor-flash-down",
                    loading && !result && "animate-pulse text-white/30",
                  )}
                >
                  {receive === null ? (loading ? "…" : "—") : money(receive)}
                </output>
                <QuickPicks options={currencies} exclude={[from, to]} onPick={setTo} />
                <CurrencySelect label="Receive currency" value={to} options={currencies} onChange={(c) => (c === from ? swap() : setTo(c))} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/45">
                <span>
                  {selected?.totalCostPct !== null && selected?.totalCostPct !== undefined ? (
                    <>
                      ≈ <span className={cn("font-semibold", selected.totalCostPct <= 0.5 ? "text-emerald-300" : selected.totalCostPct <= 1.5 ? "text-white/75" : "text-red-300")}>{selected.totalCostPct.toFixed(2)}%</span> all-in vs mid-market
                    </>
                  ) : selected?.partial ? (
                    "Product-specific fees or eligibility not confirmed"
                  ) : (
                    " "
                  )}
                </span>
                {selected?.delivery ? <span>Arrives {selected.delivery}</span> : null}
              </div>
            </div>
          </div>

          {rate !== null ? (
            <button type="button" onClick={() => setInverted((v) => !v)} className="inline-flex w-fit items-center gap-1.5 px-1 text-[12px] text-white/55 transition hover:text-white" title="Flip the rate">
              <Info size={13} />
              {inverted ? `1 ${to} ≈ ${rateText(1 / rate)} ${from}` : `1 ${from} ≈ ${rateText(rate)} ${to}`}
              <ArrowLeftRight size={12} />
            </button>
          ) : null}

          {"href" in cta && cta.href ? (
            <Link
              href={cta.href}
              target={"external" in cta && cta.external ? "_blank" : undefined}
              rel={"external" in cta && cta.external ? "noreferrer noopener" : undefined}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-orange)] px-5 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_30px_-12px_rgba(233,90,44,.8)] transition hover:-translate-y-px hover:bg-[#ff6a3d]"
            >
              {cta.label}
              {"external" in cta && cta.external ? <ArrowUpRight size={16} /> : null}
            </Link>
          ) : (
            <button type="button" disabled className="mt-1 w-full rounded-full bg-white/[0.08] px-5 py-3.5 text-[15px] font-semibold text-white/45">
              {cta.label}
            </button>
          )}
          {"secondary" in cta && cta.secondary ? (
            <Link
              href={cta.secondary.href}
              target={"external" in cta.secondary && cta.secondary.external ? "_blank" : undefined}
              rel={"external" in cta.secondary && cta.secondary.external ? "noreferrer noopener" : undefined}
              className="-mt-1 text-center text-[12px] font-semibold text-white/55 underline decoration-dotted underline-offset-4 hover:text-white"
            >
              {cta.secondary.label}
            </Link>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-red-400/10 px-3 py-2 text-[12.5px] text-red-200">
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-white">
              <Tag size={15} className="text-[#ffad8c]" /> Provider prices
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-bold text-white/70">{quotes.length + estimates.length}</span>
            </h2>
            <span className="text-[11.5px] text-white/45">checked {ago(now - fetchedAt)}</span>
          </div>

          <ol className="flex flex-col gap-1 rounded-2xl border border-white/10 p-1.5">
            {quotes.length ? (
              quotes.map((row) => <QuoteRow key={row.providerSlug} row={row} best={row === best} selected={row === selected} flash={flashes[row.providerSlug]} onPick={() => setPicked(row.providerSlug)} mode={mode} connected={connected.includes(connectionProviderSlug(row.providerSlug))} />)
            ) : (
              <li className="px-3 py-4 text-[12.5px] text-white/50">{loading ? "Fetching quotes…" : "No provider returned a price for this pair."}</li>
            )}
          </ol>

          {estimates.length ? (
            <details className="group rounded-2xl border border-white/10 px-1.5 py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[12.5px] font-semibold text-white/70">
                Market estimates · {estimates.length}
                <span className="text-[11px] font-normal text-white/40">consumer prices, collected by Wise · never ranked best</span>
              </summary>
              <ol className="flex flex-col gap-1 pb-1">
                {estimates.map((row) => (
                  <QuoteRow key={row.providerSlug} row={row} best={false} selected={row === selected} flash={flashes[row.providerSlug]} onPick={() => setPicked(row.providerSlug)} mode={mode} connected={connected.includes(connectionProviderSlug(row.providerSlug))} />
                ))}
              </ol>
            </details>
          ) : null}

          {result?.marketCoverage?.matched ? (
            <details open className="group rounded-2xl border border-white/10 px-1.5 py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-1.5 text-[12.5px] font-semibold text-white/70">
                <span>Broader market coverage · {result.marketCoverage.matched}</span>
                <span className="text-right text-[11px] font-normal text-white/40">
                  {result.marketCoverage.matched} of {result.marketCoverage.totalTracked} tracked payment providers list {to}
                </span>
              </summary>
              <p className="px-2 pb-2 text-[11px] leading-snug text-white/45">
                Coverage records only — not quotes or proof that this exact {from} → {to} route is available. Open a provider to confirm eligibility and pricing.
              </p>
              <ul className="grid grid-cols-1 gap-1 pb-1">
                {result.marketCoverage.providers.map((provider) => (
                  <li key={provider.providerSlug} className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                    <ProviderLogo slug={provider.providerSlug} name={provider.providerName} size={24} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12.5px] font-semibold text-white">{provider.providerName}</span>
                      <span className="truncate text-[10.5px] text-white/45">{provider.category}</span>
                    </span>
                    <span className={cn("shrink-0 rounded-md px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide", provider.currencyMatch === "both" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.08] text-white/55")}>
                      {provider.currencyMatch === "both" ? `${from} + ${to}` : to}
                    </span>
                    {provider.websiteUrl ? (
                      <a href={provider.websiteUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open ${provider.providerName}`} className="grid size-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/[0.08] hover:text-white">
                        <ArrowUpRight size={13} />
                      </a>
                    ) : null}
                    <ConnectionLink slug={provider.providerSlug} name={provider.providerName} mode={mode} connected={connected.includes(provider.providerSlug)} />
                  </li>
                ))}
              </ul>
              <Link href={mode === "app" ? "/app/providers" : "/providers"} className="mx-2 mb-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#ffad8c] hover:text-white">
                Browse the full {result.marketCoverage.totalTracked}-provider payment market <ArrowUpRight size={12} />
              </Link>
            </details>
          ) : null}

          {unavailable.length ? (
            <ul className="flex flex-col gap-1">
              {unavailable.map((u) => (
                <li key={u.providerSlug} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/15 px-3 py-2.5">
                  <ProviderLogo slug={u.providerSlug} name={u.providerName} size={26} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-semibold text-white">{u.providerName}</span>
                    <span className="text-[11.5px] text-white/50">{u.reason}</span>
                  </span>
                  <ConnectionLink slug={u.providerSlug} name={u.providerName} mode={mode} connected={connected.includes(u.providerSlug)} />
                </li>
              ))}
            </ul>
          ) : null}
          {excluded.length ? <details className="rounded-xl border border-red-300/20 p-3 text-[12px] text-white/70"><summary className="cursor-pointer">Outside documented profile rules · {excluded.length}</summary><ul className="mt-2 space-y-2">{excluded.map((row) => <li key={row.providerSlug}><strong>{row.providerName}</strong><p>{row.profileAssessment?.reasons.join(" ")}</p><ConnectionLink slug={row.providerSlug} name={row.providerName} mode={mode} connected={connected.includes(row.providerSlug)} /></li>)}</ul></details> : null}
          {selected?.profileAssessment ? <section aria-label="Selected provider profile requirements" className="rounded-xl border border-white/15 p-3 text-[12px] text-white/70"><h3 className="font-semibold text-white">{selected.providerName} · {selected.profileAssessment.status === "documented" ? "Documented profile match" : "Profile unconfirmed"}</h3><p className="mt-2">{selected.profileAssessment.reasons.join(" ")}</p><dl className="mt-3 space-y-3">{[{ label: "KYC / KYB", value: selected.profileAssessment.verification.join(" ") }, { label: "Expected fees", value: selected.profileAssessment.fees }, { label: "Transfer limits", value: selected.profileAssessment.limits }, { label: "Available corridors", value: selected.profileAssessment.corridors }, { label: "Settlement methods", value: selected.profileAssessment.settlement.join(" ") }, { label: "Documents", value: selected.profileAssessment.documents.join(" ") }, { label: "Payment purpose", value: selected.profileAssessment.purpose }].map((item) => <div key={item.label}><dt className="font-semibold text-white/90">{item.label}</dt><dd className="mt-0.5 leading-relaxed">{item.value}</dd></div>)}</dl>{selected.profileAssessment.sources.length ? <div className="mt-3 flex flex-wrap gap-2">{selected.profileAssessment.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="text-[#ffad8c] underline">{source.label} ↗</a>)}<p className="w-full text-[10px] text-white/45">Rules reviewed {selected.profileAssessment.reviewedAt}</p></div> : null}</section> : null}
          {selected ? (
            <details className="rounded-xl border border-white/10 px-3 py-2 text-[11.5px] text-white/55">
              <summary className="cursor-pointer">{selected.providerName} · {priceSourceTime(selected.observedAt, selected.basis)}</summary>
              <div className="mt-2 flex flex-col gap-2">
                {selected.source.url ? <a href={selected.source.url} target="_blank" rel="noreferrer noopener" className="w-fit text-[#ffad8c] underline underline-offset-2">{selected.source.label} ↗</a> : <span>{selected.source.label}</span>}
                {selected.notes.map((note, index) => <p key={index}>{note}</p>)}
              </div>
            </details>
          ) : null}
        </div>
      </section>
      <PlatformQuotePanel checks={result?.platformQuotes ?? []} now={now} />
      <p className="px-1 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
        Sources and price basis are labelled separately. Mid-market reference: {result?.reference?.source ?? "not available"}. Published schedules are estimates, not guaranteed payout amounts. Additional banking or corridor fees may apply.
      </p>
    </div>
  );
}

function ConnectionLink({ slug, name, mode, connected }: { slug: string; name: string; mode: "app" | "public"; connected: boolean }) {
  return <Link href={providerConnectionPath(slug, mode)} prefetch={false} aria-label={`${connected ? "Manage" : "Connect"} ${name}`}
    title={`Open ${name}'s account connection options`}
    className="mr-2 inline-flex shrink-0 items-center rounded-full border border-white/15 px-2 py-1.5 text-[10.5px] font-semibold text-[#ffad8c] transition hover:border-[#ffad8c]/60 hover:bg-white/[0.07]">
    {connected ? "Manage" : "Connect"}
  </Link>;
}

function QuoteRow({ row, best, selected, flash, onPick, mode, connected }: { row: PriceRow; best: boolean; selected: boolean; flash?: "up" | "down"; onPick: () => void; mode: "app" | "public"; connected: boolean }) {
  const tag = BASIS[row.basis];
  return (
    <li className={cn("flex items-center rounded-xl border transition", selected ? "border-[#f5c451]/60 bg-[#f5c451]/[0.07]" : "border-transparent hover:bg-white/[0.05]")}>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2.5 text-left"
      >
        <ProviderLogo slug={row.providerSlug} name={row.providerName} src={row.logoUrl} size={28} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13.5px] font-semibold text-white">{row.providerName}</span>
            {best ? <span className="rounded-md bg-[#f5c451] px-1.5 py-px text-[10.5px] font-bold text-[#2a2410]">{row.profileAssessment ? "Lowest documented estimate" : "Best price"}</span> : null}
            <span title={tag.hint} className={cn("rounded-md px-1.5 py-px text-[10px] font-bold uppercase tracking-wide", tag.cls)}>
              {tag.label}
            </span>
            {row.partial ? <span className="rounded-md bg-red-400/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-red-200">partial reference</span> : null}
          </span>
          <span className="truncate text-[11.5px] text-white/45">
            fee {row.feeAmount === null ? "—" : `${money(row.feeAmount)} ${row.feeCurrency ?? ""}`}
            {row.delivery ? ` · ${row.delivery}` : ""}
            {row.totalCostPct !== null ? ` · ${row.totalCostPct.toFixed(2)}% all-in` : ""}
          </span>
          {row.profileAssessment ? <span className={cn("text-[10px]", row.profileAssessment.status === "documented" ? "text-emerald-300" : "text-amber-200/70")}>{row.profileAssessment.status === "documented" ? "Documented profile match" : "Profile unconfirmed"}</span> : null}
          <span className="truncate text-[10px] text-white/35" title={priceSourceTime(row.observedAt, row.basis)}>{priceSourceTime(row.observedAt, row.basis)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn("text-[14px] font-semibold tabular text-white", flash === "up" && "railor-flash-up", flash === "down" && "railor-flash-down")}>{money(row.recipientAmount)}</span>
          {row.shortfall ? (
            <span className={cn("text-[10.5px] font-semibold tabular", row.shortfall > 0 ? "text-red-300/80" : "text-emerald-300/80")}>
              {row.shortfall > 0 ? "−" : "+"}
              {money(Math.abs(row.shortfall))}
            </span>
          ) : null}
        </span>
      </button>
      <ConnectionLink slug={row.providerSlug} name={row.providerName} mode={mode} connected={connected} />
    </li>
  );
}
