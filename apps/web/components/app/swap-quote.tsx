"use client";

import Link from "next/link";
import { contextForPair } from "../../lib/price-destination";

import { PairActions, SavedPairsStrip, TransferBookmarkButton } from "../price/pair-actions";
import { RateAlertCard } from "../price/rate-alert-card";
import type { Plan } from "../../lib/plans";
import { savedProviderSlug } from "../../lib/saved-transfer";
import { goHref } from "../../lib/provider-go";
import type { SavedPair } from "../../lib/saved-pairs";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownUp, ArrowLeftRight, ArrowUpRight, ChevronDown, FileUp, Info, LoaderCircle, LockKeyhole, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CustomerContext, PriceBasis, PriceCheckResult, PriceRow, RowWebCheck, WebCheckSummary } from "@railor/core";
import { Flag, cn, type PickerOption } from "@railor/ui";
import { fallbackFill } from "../marketing/logo-fallback";
import { ProviderLogo } from "./provider-logo";
import { ProviderWordmark } from "./provider-wordmark";
import { PlatformQuotePanel } from "./platform-quote-panel";
import { PriceHistoryTabs } from "../price/price-history-tabs";
import { connectionProviderSlug, priceSourceTime } from "../../lib/connection-navigation";
import { PriceProviderBrowser, type ProviderQuoteAdvice } from "./price-provider-browser";
import { PriceDisclosure } from "./price-disclosure";
import { providerLink, providerSite } from "../../lib/provider-sites";
import { AmountInput, QuoteAmount, RollingCost, RollingNumber, RollingRate } from "../price/animated-amount";
import { CurrencyPicker } from "../price/currency-picker";
import { CardPricingComingSoon, PayMethodSelect } from "../price/pay-method-select";
import { contextParams, priceResponseMatches } from "../../lib/price-response";
import { priceRowKey, providerIdentity } from "../../lib/price-display";
import { priceView } from "../../lib/price-view";
import { benchmarkCost, formatBenchmarkCost } from "../../lib/price-cost";
import styles from "./price-check.module.css";
import priceStyles from "../price/price.module.css";

/**
 * A swap-style live quote: pick what you send and what they receive, and
 * every provider's price streams in, re-quoted every REFRESH_SECONDS. The
 * best actionable price is selected by default; any row can be picked.
 * Every number keeps its basis label — a published schedule or a market
 * estimate is never dressed up as a live quote.
 */

const REFRESH_SECONDS = 20;
const ACCOUNT_QUOTE_SLUGS = new Set(["wise", "airwallex", "xflow", "dlocal"]);
const PRESETS = [
  { value: 100, label: "100" },
  { value: 1_000, label: "1K" },
  { value: 10_000, label: "10K" },
  { value: 50_000, label: "50K" },
];

const BASIS: Record<PriceBasis, { label: string; cls: string; hint: string }> = {
  exact: { label: "Your account", cls: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]", hint: "A live quote from your connected account; check whether fees and total debit are complete." },
  live_public: { label: "Public reference", cls: "bg-[#e8f1ff] text-[#1b4a85]", hint: "A public API observation, not your business's executable quote. Your account's price can differ." },
  published: { label: "Published", cls: "bg-[var(--color-warn-bg)] text-[var(--color-warn)]", hint: "The provider's published fee schedule at the mid-market rate — not a quote." },
  market_estimate: { label: "Estimate", cls: "bg-[var(--color-canvas)] text-[var(--color-muted)]", hint: "Consumer pricing collected by Wise from the provider's site, dated." },
};

function money(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rateText(n: number) {
  return n.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

function CurrencyBadge({ code, symbol, flag, size = 26 }: { code: string; symbol?: string; flag?: string; size?: number }) {
  // The issuing country's flag, round like a token logo; the symbol circle is only the fallback.
  if (flag) {
    return (
      <span className="inline-flex shrink-0 rounded-full ring-1 ring-black/10" style={{ width: size, height: size }}>
        <Flag code={flag} size={size} round />
      </span>
    );
  }
  const glyph = (symbol || code.charAt(0)).slice(0, 3);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: fallbackFill(code, 3), fontSize: size * (glyph.length > 1 ? 0.34 : 0.5) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[var(--color-ink)] ring-1 ring-black/10"
    >
      {glyph}
    </span>
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
    <button type="button" onClick={onClick} aria-label="Refresh quotes now" title={`Refreshes every ${REFRESH_SECONDS}s`} className="relative grid size-9 place-items-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]">
      <svg viewBox="0 0 28 28" className="absolute inset-0 size-9 -rotate-90" aria-hidden>
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgb(21 19 16 / .1)" strokeWidth="2" />
        <circle cx="14" cy="14" r={r} fill="none" stroke="var(--color-orange)" strokeWidth="2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, elapsed / REFRESH_SECONDS))} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
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
  guest?: boolean;
  basePath: string;
  currencies: PickerOption[];
  initial: { from: string; to: string; amount: number; market: boolean; context: CustomerContext; destinationCountry?: string };
  initialResult: PriceCheckResult | null;
  initialError?: string;
  /** Providers Railor can execute payouts through. */
  executable: string[];
  /** Providers this workspace has a production connection for. */
  connected: string[];
  /** Pairs saved from this calculator (signed-in dashboards only). */
  savedPairs?: SavedPair[];
  initialProvider?: string;
  /** The workspace's registered country, which decides whether a pair is received or sent. */
  entityCountry?: string | null;
  /** The signed-in account's email: rate alerts are sent here. */
  accountEmail?: string | null;
  /** The workspace's plan, for the alert card. */
  alertPlan?: Plan;
}

export function SwapQuote({ mode, basePath, currencies, initial, initialResult, initialError, executable, connected, savedPairs, initialProvider, guest = false, entityCountry = null, accountEmail = null, alertPlan = "free" }: SwapQuoteProps) {
  const [saved, setSaved] = useState<SavedPair[]>(savedPairs ?? []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [amountText, setAmountText] = useState(String(initial.amount));
  const [market, setMarket] = useState(initial.market);
  const [context, setContext] = useState(initial.context);
  const [response, setResult] = useState(initialResult);
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  // Both clocks start at the server's quote time so server and client render the same markup.
  const serverTime = Date.parse(initialResult?.generatedAt ?? "") || 0;
  const [fetchedAt, setFetchedAt] = useState(serverTime);
  const [now, setNow] = useState(serverTime);
  const destinationCountry = to === initial.to ? initial.destinationCountry : undefined;
  const scope = JSON.stringify([from, to, context, destinationCountry]);
  const [selection, setSelection] = useState<{ scope: string; slug: string | null; rowKey?: string }>(() => ({ scope, slug: initialProvider ?? null }));
  const selectionRef = useRef(selection);
  const picked = selection.scope === scope ? selection.slug : null;
  const [inverted, setInverted] = useState(false);
  const [flashes, setFlashes] = useState<Record<string, "up" | "down">>({});
  const controller = useRef<AbortController | null>(null);
  const previous = useRef<Record<string, number>>({});
  const firstRun = useRef(true);

  const amount = Number(amountText);
  const invoiceTarget = `/app/freelancer?${new URLSearchParams({
    from: "prices", amount: amount > 0 ? String(amount) : "", currency: from, method: context.paymentMethod ?? "local_bank",
  })}#invoice`;
  const invoiceHref = guest ? `/login?next=${encodeURIComponent(invoiceTarget)}` : invoiceTarget;
  const valid = Boolean(from && to && from !== to && amount > 0);
  const cardComingSoon = context.direction === "receive" && context.paymentMethod === "card";
  const result = priceResponseMatches(response, { from, to, amount, market, context, destinationCountry }) ? response : null;
  const contextCurrent = Boolean(result);

  function setPicked(slug: string, rowKey?: string) {
    const next = { scope, slug, rowKey };
    selectionRef.current = next;
    setSelection(next);
  }

  const load = useCallback(async () => {
    if (!valid || cardComingSoon) return;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoading(true);
    const q = new URLSearchParams({ from, to, amount: String(amount), market: market ? "1" : "0", ...contextParams(context) });
    if (destinationCountry) q.set("destinationCountry", destinationCountry);
    try {
      const res = await fetch(`/api/prices?${q}`, { signal: ctl.signal, cache: "no-store" });
      const body = (await res.json()) as PriceCheckResult & { error?: string };
      if (controller.current !== ctl || ctl.signal.aborted) return;
      if (!res.ok) throw new Error(body.error ?? `Price check failed (HTTP ${res.status}).`);
      // Flash rows whose price moved since the last poll of the same request.
      const moves: Record<string, "up" | "down"> = {};
      for (const row of body.rows) {
        const key = priceRowKey(row);
        const before = previous.current[key];
        if (before !== undefined && row.recipientAmount !== null && row.recipientAmount !== before) moves[key] = row.recipientAmount > before ? "up" : "down";
      }
      previous.current = Object.fromEntries(body.rows.flatMap((r) => (r.recipientAmount === null ? [] : [[priceRowKey(r), r.recipientAmount]])));
      setFlashes(moves);
      setResult(body);
      setError("");
      setFetchedAt(Date.now());
      const pin = selectionRef.current;
      const savedSlug = pin.scope === scope ? savedProviderSlug(pin.slug) : undefined;
      if (mode === "app" && savedSlug) q.set("provider", savedSlug);
      window.history.replaceState(null, "", `${basePath}?${q}`);
    } catch (e) {
      if (!ctl.signal.aborted && controller.current === ctl && (e as Error).name !== "AbortError") {
        setError((e as Error).message);
        // A failure waits out the same cycle as a success — never a tight retry loop.
        setFetchedAt(Date.now());
      }
    } finally {
      if (controller.current === ctl) setLoading(false);
    }
  }, [valid, cardComingSoon, from, to, amount, market, context, destinationCountry, basePath, scope, mode]);

  // Re-quote on any input change (typing waits a beat); a new pair resets the flash baseline.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      previous.current = Object.fromEntries((initialResult?.rows ?? []).flatMap((r) => (r.recipientAmount === null ? [] : [[priceRowKey(r), r.recipientAmount]])));
      return;
    }
    previous.current = {};
    controller.current?.abort();
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
    if (!loading && valid && !cardComingSoon && document.visibilityState === "visible" && now - fetchedAt >= REFRESH_SECONDS * 1000) void load();
  }, [now, fetchedAt, loading, valid, cardComingSoon, load]);

  useEffect(() => {
    if (!Object.keys(flashes).length) return;
    const t = window.setTimeout(() => setFlashes({}), 1500);
    return () => window.clearTimeout(t);
  }, [flashes]);

  async function getProviderQuote(slug: string, signal: AbortSignal) {
    const query = new URLSearchParams({ from, to, amount: String(amount), market: market ? "1" : "0", provider: slug, ...contextParams(context) });
    if (destinationCountry) query.set("destinationCountry", destinationCountry);
    const res = await fetch("/api/prices/provider?" + query, { method: "POST", signal, cache: "no-store" });
    const payload = await res.json() as Partial<ProviderQuoteAdvice> & { quote?: PriceRow; error?: string };
    if (!res.ok || !payload.quote) return { message: payload.error ?? payload.message ?? "The provider didn’t return a price for these inputs.", evidence: payload.evidence, researchPending: payload.researchPending };
    if (signal.aborted) return null;
    const quote = payload.quote;
    setResult(previous => previous && priceResponseMatches(previous, { from, to, amount, market, context, destinationCountry })
      ? { ...previous, rows: [...previous.rows.filter(row => row.providerSlug !== quote.providerSlug), quote] }
      : previous);
    return null;
  }

  const { quotes, estimates, excluded, best } = priceView(result, now);
  const unavailable = result?.unavailable.filter(u => !result.platformQuotes?.some(check => check.providerSlug === u.providerSlug && check.status === "quoted")) ?? [];
  const candidates = (result?.marketCoverage?.allProviders ?? result?.marketCoverage?.providers ?? []).filter((candidate) => !excluded.some((row) => providerIdentity(row.providerSlug) === candidate.providerSlug) && !quotes.some(row => providerIdentity(row.providerSlug) === candidate.providerSlug));
  const visibleRows = [...quotes, ...estimates];
  const pickedPrice = picked ? visibleRows.find(row => priceRowKey(row) === selection.rowKey)
    ?? visibleRows.find(row => row.providerSlug === picked)
    ?? visibleRows.find(row => providerIdentity(row.providerSlug) === providerIdentity(picked)) : null;
  const selectedCandidate = picked && !pickedPrice ? candidates.find(candidate => candidate.providerSlug === providerIdentity(picked)) ?? null : null;
  const selected = picked ? pickedPrice ?? null : best ?? quotes[0] ?? estimates[0] ?? null;
  const midValue = result?.reference ? amount * result.reference.rate : null;
  const rate = selected?.rate ?? result?.reference?.rate ?? null;
  const selectedCost = selected ? benchmarkCost(selected, amount, result?.reference?.rate, to) : null;
  const elapsed = (now - fetchedAt) / 1000;
  const sym = (code: string) => currencies.find((c) => c.value === code)?.emoji;

  // A new pair gets a fresh context: receiving INR and sending from INR follow different rules.
  const setPair = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setContext((current) => contextForPair(current, entityCountry, nextFrom, nextTo));
  };
  const swap = () => setPair(to, from);

  // A working next step: the chosen provider's own site, or the page its price came from.
  const chosenSlug = selected?.providerSlug ?? selectedCandidate?.providerSlug ?? null;
  const chosenName = (selected?.providerName ?? selectedCandidate?.providerName ?? "").split(" · ")[0] ?? "";
  const bookmarkSlug = savedProviderSlug(chosenSlug);
  const transfer = { from, to, amount: amount || 0 };
  const bookmark = bookmarkSlug ? { ...transfer, context, destinationCountry: result?.input.destinationCountry, provider: { slug: bookmarkSlug, name: chosenName } } : null;
  // The provider's own page for this transfer: Wise with the amount filled in, others on the route where checked.
  const link = chosenSlug && valid ? providerLink(chosenSlug, transfer) : null;
  // Outbound clicks go through the "Taking you to ..." page, which sends the visitor on to the provider's own page.
  const site = link?.href ?? (chosenSlug ? providerSite(chosenSlug) : null);
  const outbound = chosenSlug && site ? goHref(chosenSlug, transfer) ?? site : null;
  const sourceUrl = selected?.source?.url && /^https:\/\//.test(selected.source.url) ? selected.source.url : null;
  const cta: { label: string; href?: string; external?: boolean; disabled?: boolean; secondary?: { label: string; href: string; external?: boolean } } = !valid
    ? { label: from === to ? "Pick two different currencies" : "Enter an amount", disabled: true }
    : site
      ? { label: `Go to ${chosenName}`, href: outbound ?? site, external: true, ...(sourceUrl && !sourceUrl.startsWith(site) ? { secondary: { label: "See where this price came from", href: sourceUrl, external: true } } : {}) }
      : sourceUrl
        ? { label: `See ${chosenName}’s pricing`, href: sourceUrl, external: true }
        : { label: loading ? "Fetching prices…" : chosenName ? `${chosenName} has no public site link yet` : "Select a provider", disabled: true };

  const reducedMotion = useReducedMotion();
  return (
    <div className={styles.comparisonLayout}>
      <section className="price-surface p-3 sm:p-4" aria-label="Price comparison">
        <div className="relative z-10 flex flex-col gap-2">
          {savedPairs ? <SavedPairsStrip saved={saved} active={picked && bookmark ? bookmark : transfer} onSaved={setSaved} /> : null}
          {!cardComingSoon && <div className="flex items-center justify-between gap-2 px-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-canvas)] px-3 py-1 text-[12px] font-semibold text-[var(--color-ink-soft)]">
              <span className="relative flex size-2">
                <span className="relative inline-flex size-2 rounded-full bg-[#22a35a]" />
              </span>
              Price observations
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={market}
                onClick={() => setMarket((m) => !m)}
                title="Add consumer prices collected by Wise's comparison feed"
                className={cn("rounded-full border px-2.5 py-1 text-[13px] font-semibold transition", market ? "border-[var(--color-orange)]/40 bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line-strong)] text-[var(--color-muted)] hover:text-[var(--color-ink)]")}
              >
                {market ? "Market estimates on" : "+ Market estimates"}
              </button>
              <RefreshRing elapsed={elapsed} loading={loading} onClick={() => void load()} />
            </div>
          </div>}

          <div role="group" aria-label="Account type" className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
            <span className="text-[12px] font-medium text-[var(--color-muted)]">I’m {context.direction === "receive" ? "receiving" : "sending"} as</span>
            <div className="inline-flex rounded-full border border-[var(--color-line)] bg-[var(--color-canvas)] p-1">
              {([{ value: "business", label: "Business" }, { value: "freelancer", label: "Freelancer" }, { value: "personal", label: "Personal" }] as const).map((option) => {
                const active = context.profile === option.value || (option.value === "freelancer" && context.profile === "sole_proprietor");
                return <button key={option.value} type="button" aria-pressed={active}
                  onClick={() => setContext((c) => ({ ...c, profile: option.value, purpose: option.value === "personal" ? "personal" : c.purpose === "personal" ? "services" : c.purpose,
                    paymentMethod: c.direction === "receive" ? (option.value === "personal" ? "transfer_service" : c.paymentMethod && c.paymentMethod !== "transfer_service" ? c.paymentMethod : "local_bank") : undefined }))}
                  className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold transition", active ? "bg-[var(--color-ink)] text-[#fff]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]")}>
                  {option.label}
                </button>;
              })}
            </div>
            {!contextCurrent && !cardComingSoon ? <span role="status" className="sr-only">Checking this profile…</span> : null}
          </div>
          {context.direction === "receive" ? (
            <div className="px-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <PayMethodSelect
                  cardComingSoon
                  value={context.paymentMethod ?? (context.profile === "personal" ? "transfer_service" : "local_bank")}
                  onChange={(paymentMethod) => setContext((c) => ({ ...c, paymentMethod }))}
                  label={context.profile === "personal" ? "Sender pays by" : "Client pays by"}
                />
                {context.profile !== "personal" && !cardComingSoon ? (
                  <Link prefetch={false} href={invoiceHref} className={`${priceStyles.invoiceLink} press`} title={guest ? "Sign in to upload an invoice" : "Railor reads the amount, currency and client from your invoice. You review it before anything is saved."}>
                    <FileUp size={14} aria-hidden />Upload invoice
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {cardComingSoon ? <CardPricingComingSoon personal={context.profile === "personal"} onCompare={() => setContext(c => ({ ...c, paymentMethod: c.profile === "personal" ? "transfer_service" : "local_bank" }))} /> : <>
          <div className="relative flex flex-col gap-1.5">
            <div className="rounded-2xl border border-transparent bg-[var(--color-canvas)] p-4 transition focus-within:border-[var(--color-ink)]">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="swap-amount" className="text-[12.5px] font-medium text-[var(--color-muted)]">
                  {context.direction === "receive" ? (context.profile === "personal" ? "Your sender sends" : "Your client sends") : "You send"}
                </label>
                <div className="flex gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setAmountText(String(p.value))}
                      className={cn("rounded-md px-1.5 py-0.5 text-[12.5px] font-bold transition", amount === p.value ? "bg-[var(--color-ink)] text-[#fff]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <AmountInput
                  id="swap-amount"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 12))}
                  className="min-w-0 flex-1 bg-transparent font-display text-[clamp(1.7rem,6vw,2.25rem)] font-semibold tracking-tight text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
                />
                <QuickPicks options={currencies} exclude={[from, to]} onPick={(c) => setPair(c, to)} />
                <CurrencyPicker label="Send currency" value={from} options={currencies} onChange={(c) => (c === to ? swap() : setPair(c, to))} />
              </div>
              <p className="mt-2 text-[12px] text-[var(--color-muted)]">{midValue !== null ? <>≈ <RollingNumber value={midValue} /> {to} at the mid-market rate</> : " "}</p>
            </div>

            <button
              type="button"
              onClick={swap}
              aria-label="Swap currencies"
              className="absolute left-1/2 top-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[var(--color-surface)] bg-[var(--color-ink)] text-[#fff] transition hover:bg-[#2a2722]"
            >
              <motion.span initial={false} animate={{ rotate: (from > to) === (initial.from > initial.to) ? 0 : 180 }} transition={{ duration: reducedMotion ? 0 : .2 }}><ArrowDownUp size={15} /></motion.span>
            </button>

            <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-[var(--color-muted)]">{context.direction === "receive" ? "You receive" : "They receive"}{selected?.partial ? " · reference amount" : ""}</span>
                {selected || selectedCandidate ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
                    {selected?.side === "payer" ? "sent with" : "via"} <ProviderWordmark slug={selected?.providerSlug ?? selectedCandidate!.providerSlug} name={selected?.providerName ?? selectedCandidate!.providerName} src={selected?.logoUrl} size="compact" />
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <output
                  aria-live="polite"
                  className={cn(
                    "min-w-0 flex-1 truncate font-display text-[clamp(1.7rem,6vw,2.25rem)] font-semibold tracking-tight tabular text-[var(--color-ink)]",
                    selected && flashes[priceRowKey(selected)] === "up" && "railor-flash-up",
                    selected && flashes[priceRowKey(selected)] === "down" && "railor-flash-down",
                    loading && !result && "animate-pulse text-[var(--color-faint)]",
                  )}
                >
                  <QuoteAmount key={`${from}-${to}`} value={selected?.recipientAmount ?? null} identity={selected ? priceRowKey(selected) : undefined} placeholder={loading ? "…" : "—"} />
                </output>
                <QuickPicks options={currencies} exclude={[from, to]} onPick={(c) => setPair(from, c)} />
                <CurrencyPicker label="Receive currency" value={to} options={currencies} onChange={(c) => (c === from ? swap() : setPair(from, c))} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--color-muted)]">
                <span>
                  {selectedCost?.kind === "cost" ? (
                    <>
                      Cost <span className={cn("font-semibold", selectedCost.bps <= 50 ? "text-[var(--color-ok)]" : selectedCost.bps <= 150 ? "text-[var(--color-ink-soft)]" : "text-[var(--color-bad)]")}><RollingCost cost={selectedCost} unit="percent" /></span> vs mid-market
                    </>
                  ) : selected?.partial ? (
                    selected.publicOffer ? "First transfer · US bank funded" : selected.missing?.[0] ? `Missing: ${selected.missing[0]}` : "Partial estimate · a cost is unknown"
                  ) : (
                    " "
                  )}
                </span>
                {selected?.delivery ? <span>Arrives {selected.delivery}</span> : null}
              </div>
            </div>
          </div>

          {rate !== null ? (
            <button type="button" onClick={() => setInverted((v) => !v)} className="inline-flex w-fit items-center gap-1.5 px-1 text-[12px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]" title="Flip the rate">
              <Info size={13} />
              {inverted ? <>1 {to} ≈ <RollingRate value={1 / rate} /> {from}</> : <>1 {from} ≈ <RollingRate value={rate} /> {to}</>}
              <ArrowLeftRight size={12} />
            </button>
          ) : null}

          {"href" in cta && cta.href ? (
            <Link
              href={cta.href}
              target={"external" in cta && cta.external ? "_blank" : undefined}
              rel={"external" in cta && cta.external ? "noreferrer noopener" : undefined}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-orange)] px-5 py-3.5 text-[15px] font-bold text-[#fff] shadow-[0_10px_30px_-12px_rgba(233,90,44,.8)] transition hover:bg-[#d94c22]"
            >
              {cta.label}
              {"external" in cta && cta.external ? <ArrowUpRight size={16} /> : null}
            </Link>
          ) : (
            <button type="button" disabled className="mt-1 w-full rounded-full bg-[var(--color-canvas)] px-5 py-3.5 text-[15px] font-semibold text-[var(--color-muted)]">
              <LockKeyhole size={14} className="mr-2 inline" />{cta.label}
            </button>
          )}
          {"secondary" in cta && cta.secondary ? (
            <Link
              href={cta.secondary.href}
              target={"external" in cta.secondary && cta.secondary.external ? "_blank" : undefined}
              rel={"external" in cta.secondary && cta.secondary.external ? "noreferrer noopener" : undefined}
              className="-mt-1 text-center text-[12px] font-semibold text-[var(--color-muted)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-ink)]"
            >
              {cta.secondary.label}
            </Link>
          ) : null}
          {savedPairs ? <PairActions transfer={{ ...transfer, profile: context.profile }} saved={saved} onSaved={setSaved} /> : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-[var(--color-bad-bg)] px-3 py-2 text-[12.5px] text-[var(--color-bad)]">
              {error}
            </p>
          ) : null}

          </>}
        </div>
      </section>
      {!cardComingSoon && <>
      <PriceProviderBrowser
        rows={quotes} estimates={estimates} receiving={context.direction === "receive" || context.profile !== "personal"} selected={selected} best={best} onSelect={setPicked} candidates={candidates} selectedCandidate={selectedCandidate}
        bookmark={savedPairs && bookmark && valid ? <TransferBookmarkButton transfer={bookmark} saved={saved} onSaved={setSaved} /> : null}
        onGetQuote={valid && !cardComingSoon ? getProviderQuote : undefined}
        from={from} to={to} amount={amount} loading={loading} checked={ago(now - fetchedAt)} flashes={flashes}
        reference={result?.reference ?? null}
        action={cta}
        connection={selected && selected.side !== "payer" ? <ConnectionLink slug={selected.providerSlug} name={selected.providerName} mode={mode} connected={connected.includes(connectionProviderSlug(selected.providerSlug))} light /> : null}
        market={estimates.length ? <div className="price-surface p-3">{estimates.length ? (
            <details open={context.profile === "personal" && context.direction === "receive"} className="group rounded-2xl border border-[var(--color-line)] px-1.5 py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[12.5px] font-semibold text-[var(--color-ink-soft)]">
                Market estimates · {estimates.length}
                <span className="text-[12.5px] font-normal text-[var(--color-faint)]">consumer prices, collected by Wise · never ranked best</span>
              </summary>
              <ol className="flex flex-col gap-1 pb-1">
                {estimates.map((row) => (
                  <QuoteRow key={priceRowKey(row)} row={row} best={false} selected={row === selected} flash={flashes[priceRowKey(row)]} onPick={() => setPicked(row.providerSlug, priceRowKey(row))} mode={mode} connected={connected.includes(connectionProviderSlug(row.providerSlug))} />
                ))}
              </ol>
            </details>
          ) : null}</div> : <p className={styles.contextEmpty}>No consumer estimates were returned. The calculator’s Market estimates toggle controls whether they are requested.</p>}
        promotions={result?.promotions}
        history={<PriceHistoryTabs from={from} to={to} amount={amount} profile={context.profile} footer={<RateAlertCard transfer={{ ...transfer, profile: context.profile }} email={guest ? null : accountEmail} plan={alertPlan} saved={saved} onSaved={setSaved} />} />}
        coverage={null}
        webEvidence={selected?.webChecks?.length ? <div className="price-surface mt-4 p-3"><WebCheckDetails checks={selected.webChecks} /></div> : null}
      />
      <div className={styles.moreContext}>
        {result?.webCheck ? <WebCheckStatus summary={result.webCheck} light /> : null}
        {(result?.platformQuotes?.length ?? 0) > 0 && <PriceDisclosure title="Railor account observations" description="Backend account observations; kept separate from your customer price."><PlatformQuotePanel checks={result?.platformQuotes ?? []} now={now} /></PriceDisclosure>}
        {(unavailable.length > 0 || excluded.length > 0) && <PriceDisclosure title="Unavailable providers & profile exclusions" description={String(unavailable.length + excluded.length) + " providers need more information or do not meet the documented rules."}><div className="price-surface p-4">{unavailable.length ? (
            <ul className="flex flex-col gap-1">
              {unavailable.map((u) => (
                <li key={`${u.providerSlug}:${u.product ?? ""}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--color-line)] px-3 py-2.5">
                  <ProviderLogo slug={u.providerSlug} name={u.providerName} size={26} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-semibold text-[var(--color-ink)]">{u.product ?? u.providerName}</span>
                    <span className="text-[13px] text-[var(--color-muted)]">{u.reason}{u.sourceUrl ? <> <a className="font-semibold text-[var(--color-orange-deep)] underline-offset-2 hover:underline" href={u.sourceUrl} target="_blank" rel="noreferrer noopener">Source ↗</a></> : null}</span>
                  </span>
                  <ConnectionLink slug={u.providerSlug} name={u.providerName} mode={mode} connected={connected.includes(u.providerSlug)} />
                </li>
              ))}
            </ul>
          ) : null}
          {excluded.length ? <details className="rounded-xl border border-[var(--color-bad)]/20 p-3 text-[12px] text-[var(--color-ink-soft)]"><summary className="cursor-pointer">Outside documented profile rules · {excluded.length}</summary><ul className="mt-2 space-y-2">{excluded.map((row) => <li key={row.providerSlug}><strong>{row.providerName}</strong><p>{row.profileAssessment?.reasons.join(" ")}</p>{row.profileAssessment?.sources.length ? <p className="mt-1 flex flex-wrap gap-2">{row.profileAssessment.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="text-[var(--color-orange-deep)] underline">{source.label} ↗</a>)}</p> : null}{row.webChecks?.length ? <WebCheckDetails checks={row.webChecks} compact /> : null}{row.side !== "payer" && context.profile !== "personal" ? <ConnectionLink slug={row.providerSlug} name={row.providerName} mode={mode} connected={connected.includes(row.providerSlug)} /> : null}</li>)}</ul></details> : null}</div></PriceDisclosure>}
        <p className={styles.priceFootnote}>Sources and price basis are labelled separately. Mid-market reference: {result?.reference?.source ?? "not available"}. Published schedules are estimates, not guaranteed payout amounts. Additional banking or corridor fees may apply.</p>
      </div>
      </>}
    </div>
  );
}

function hostOf(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function WebCheckStatus({ summary, light = false }: { summary: WebCheckSummary; light?: boolean }) {
  if (!summary.configured) return null;
  const text = summary.paused ? "Google check paused" : summary.pending ? `Google-checking ${summary.pending}…` : summary.checked ? `${summary.checked} Google-checked` : null;
  return text ? <span className={light ? styles.webSummary : "block text-[12.5px] text-[var(--color-faint)]"}>{text}</span> : null;
}

/** One chip per row: what Google found about the route this price implies. */
function WebCheckBadge({ checks }: { checks?: RowWebCheck[] }) {
  const check = checks?.[0];
  if (!check) return null;
  const chip = "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[12px] font-bold";
  if (check.state === "pending") return <span className={cn(chip, "bg-[var(--color-canvas)] text-[var(--color-muted)]")}><LoaderCircle size={10} className="animate-spin" /> checking on Google</span>;
  if (check.conflict) return <span title={check.quote ?? check.statement} className={cn(chip, "bg-[var(--color-warn-bg)] text-[var(--color-warn)]")}><TriangleAlert size={10} /> web check disagrees</span>;
  if (check.state === "supported") return <span title={`“${check.quote}” — ${hostOf(check.sourceUrl)}`} className={cn(chip, "bg-[var(--color-ok-bg)] text-[var(--color-ok)]")}><ShieldCheck size={10} /> Google-checked</span>;
  return null;
}

const CHECK_STATE: Record<RowWebCheck["state"], string> = {
  supported: "Confirmed", contradicted: "Contradicted", unclear: "Not settled by the pages found", pending: "Checking with Google Search…", not_checked: "Not checked yet",
};

function WebCheckDetails({ checks, compact = false }: { checks: RowWebCheck[]; compact?: boolean }) {
  return (
    <section aria-label="Google web check" className={cn("text-[13px] text-[var(--color-muted)]", compact ? "mt-2" : "rounded-xl border border-[var(--color-line)] p-3")}>
      {!compact ? <h3 className="flex items-center gap-1.5 font-semibold text-[var(--color-ink)]"><ShieldCheck size={13} className="text-[var(--color-ok)]" /> Google web check</h3> : null}
      <ul className={cn("space-y-2", !compact && "mt-2")}>
        {checks.map((check) => (
          <li key={check.statement}>
            <p className="text-[var(--color-muted)]">“{check.statement}”</p>
            <p className={cn("mt-0.5 font-semibold", check.conflict ? "text-[var(--color-warn)]" : check.state === "supported" ? "text-[var(--color-ok)]" : check.state === "contradicted" ? "text-[var(--color-bad)]" : "text-[var(--color-muted)]")}>
              {CHECK_STATE[check.state]}{check.conflict ? " — disagrees with what Railor shows; flagged for review" : ""}
              {check.official ? " · provider’s own site" : check.sourceUrl ? " · independent source" : ""}
            </p>
            {check.quote ? <blockquote className="mt-1 border-l-2 border-[var(--color-line)] pl-2 text-[var(--color-ink-soft)]">{check.quote}</blockquote> : null}
            {check.sourceUrl ? <a href={check.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[var(--color-orange-deep)] underline">{check.sourceTitle || hostOf(check.sourceUrl)} ↗</a> : null}
            {check.checkedAt ? <span className="ml-2 text-[12px] text-[var(--color-faint)]">checked {check.checkedAt.slice(0, 10)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConnectionLink({ slug, name, mode, connected, light = false }: { slug: string; name: string; mode: "app" | "public"; connected: boolean; light?: boolean }) {
  // Account connections aren't open yet: the public page shows nothing rather than a dead button.
  if (mode === "public" || !ACCOUNT_QUOTE_SLUGS.has(connectionProviderSlug(slug))) return null;
  return <button type="button" disabled aria-label={`Connect ${name} · Coming soon`}
    title="Account connections and execution are coming soon. Existing quote integrations remain available."
    className={light ? styles.accountLink : "mr-2 inline-flex shrink-0 items-center rounded-full border border-[var(--color-line)] px-2 py-1.5 text-[12.5px] font-semibold text-[var(--color-orange-deep)] transition hover:border-[var(--color-orange)]/50 hover:bg-[var(--color-canvas)]"}>
    <LockKeyhole size={11} className="mr-1 inline" />Coming soon
  </button>;
}

function QuoteRow({ row, best, selected, flash, onPick, mode, connected }: { row: PriceRow; best: boolean; selected: boolean; flash?: "up" | "down"; onPick: () => void; mode: "app" | "public"; connected: boolean }) {
  const tag = BASIS[row.basis];
  return (
    <li className={cn("flex items-center rounded-xl border transition", selected ? "border-[var(--color-orange)]/40 bg-[var(--color-lavender)]" : "border-transparent hover:bg-[var(--color-canvas)]")}>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13.5px] font-semibold text-[var(--color-ink)]"><ProviderWordmark slug={row.providerSlug} name={row.providerName} src={row.logoUrl} size="compact" /></span>
            {best ? <span className="rounded-md bg-[var(--color-orange)] px-1.5 py-px text-[12.5px] font-bold text-[#fff]">{row.profileAssessment ? "Lowest documented estimate" : "Best price"}</span> : null}
            <span title={tag.hint} className={cn("rounded-md px-1.5 py-px text-[12px] font-bold", tag.cls)}>
              {tag.label}
            </span>
            {row.partial ? <span className="rounded-md bg-[var(--color-bad-bg)] px-1.5 py-px text-[12px] font-bold text-[var(--color-bad)]">partial reference</span> : null}
            {row.side === "payer" ? <span title="A service your sender pays. You only need your bank account." className="rounded-md bg-[#e8f1ff] px-1.5 py-px text-[12px] font-bold text-[#1b4a85]">sender’s service</span> : null}
            <WebCheckBadge checks={row.webChecks} />
          </span>
          <span className="truncate text-[13px] text-[var(--color-muted)]">
            fee {row.feeAmount === null ? "—" : `${money(row.feeAmount)} ${row.feeCurrency ?? ""}`}
            {row.delivery ? ` · ${row.delivery}` : ""}
            {row.totalCostPct !== null ? ` · ${row.totalCostPct.toFixed(2)}% all-in` : ""}
          </span>
          {row.profileAssessment ? <span className={cn("text-[12px]", row.profileAssessment.status === "documented" ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]")}>{row.profileAssessment.status === "documented" ? "Documented profile match" : "Profile unconfirmed"}</span> : null}
          <span className="truncate text-[12px] text-[var(--color-faint)]" title={priceSourceTime(row.observedAt, row.basis)}>{priceSourceTime(row.observedAt, row.basis)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn("text-[14px] font-semibold tabular text-[var(--color-ink)]", flash === "up" && "railor-flash-up", flash === "down" && "railor-flash-down")}>{money(row.recipientAmount)}</span>
          {row.shortfall ? (
            <span className={cn("text-[12.5px] font-semibold tabular", row.shortfall > 0 ? "text-[var(--color-bad)]" : "text-[var(--color-ok)]")}>
              {row.shortfall > 0 ? "−" : "+"}
              {money(Math.abs(row.shortfall))}
            </span>
          ) : null}
        </span>
      </button>
      {/* A sender's service has nothing for the recipient to connect. */}
      {row.side === "payer" ? null : <ConnectionLink slug={row.providerSlug} name={row.providerName} mode={mode} connected={connected} />}
    </li>
  );
}
