"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownUp, ArrowRight, CircleAlert, RefreshCw } from "lucide-react";
import type { CustomerContext, PriceCheckResult, PriceRow } from "@railor/core";
import { Flag, type PickerOption } from "@railor/ui";
import { ProviderLogo } from "../app/provider-logo";
import { priceResponseMatches } from "../../lib/price-response";
import { BASIS_LABEL, priceView } from "../../lib/price-view";
import { CurrencyPicker } from "./currency-picker";
import styles from "./price.module.css";

/**
 * The calculator people meet first: an amount, two currencies and who is
 * sending, answered with the best price that profile can actually use and
 * the next two options. It uses the same price check, rules and refresh as
 * the full comparison, and hands off to it with every choice carried over.
 */

const REFRESH_SECONDS = 30;
const PRESETS = [100, 500, 1_000, 5_000, 10_000];
const PROFILES = [
  { value: "personal", label: "Personal" },
  { value: "freelancer", label: "Freelancer" },
  { value: "business", label: "Business" },
] as const;

type Profile = (typeof PROFILES)[number]["value"];

export interface QuickQuoteProps {
  variant: "hero" | "app";
  currencies: PickerOption[];
  initial: { from: string; to: string; amount: number; context: CustomerContext };
  initialResult: PriceCheckResult | null;
  initialError?: string;
  /** Where "compare all" goes: the public page or the workspace page. */
  compareBase: string;
  /** The workspace's own country, when known; otherwise India-receiving rules apply as on the price page. */
  entityCountry?: string | null;
}

const money = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function useTween(target: number | null, ms = 420) {
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

/** Same derivation as the full price page, so both screens price the same situation. */
function contextFor(to: string, profile: Profile, entityCountry: string | null | undefined, previous: CustomerContext): CustomerContext {
  const entity = entityCountry ?? "";
  return {
    ...previous,
    profile,
    country: entity || "IN",
    direction: (!entity || entity === "IN") && to === "INR" ? "receive" : "send",
    purpose: profile === "personal" ? "personal" : previous.purpose === "personal" ? "services" : previous.purpose,
  };
}

/** When a dated estimate was collected, in words. */
function collected(observedAt: string, now: number) {
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at)) return "Dated estimate";
  const hours = Math.max(0, (now - at) / 3_600_000);
  if (hours < 1) return `Collected ${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `Collected ${Math.round(hours)}h ago`;
  return `Collected ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 3 ? "just now" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

export function QuickQuote({ variant, currencies, initial, initialResult, initialError, compareBase, entityCountry }: QuickQuoteProps) {
  const reduce = useReducedMotion();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [amountText, setAmountText] = useState(String(initial.amount));
  const [focused, setFocused] = useState(false);
  const [context, setContext] = useState<CustomerContext>(initial.context);
  const [response, setResponse] = useState(initialResult);
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  const serverTime = Date.parse(initialResult?.generatedAt ?? "") || 0;
  const [fetchedAt, setFetchedAt] = useState(serverTime);
  const [now, setNow] = useState(serverTime);
  const [spin, setSpin] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const firstRun = useRef(true);

  const amount = Number(amountText);
  const valid = Boolean(from && to && from !== to && amount > 0);
  const request = useMemo(() => ({ from, to, amount, market: true, context }), [from, to, amount, context]);
  const result = priceResponseMatches(response, request) ? response : null;
  const { quotes, estimates, excluded, best } = priceView(result, now);
  // Live and published prices rank first; consumer estimates are listed after them and never called "best".
  const priced = [...quotes, ...estimates].filter((row) => row.recipientAmount !== null);
  const ranked = priced.filter((row) => row.basis !== "market_estimate");
  const dated = priced.filter((row) => row.basis === "market_estimate").sort((a, b) => b.recipientAmount! - a.recipientAmount!);
  const options: PriceRow[] = [...ranked, ...dated];
  const top = best ?? ranked[0] ?? dated[0] ?? null;
  const topIsEstimate = Boolean(top && top.basis === "market_estimate");
  const shownQuotes = ranked.slice(0, 3);
  const shownEstimates = dated.slice(0, Math.max(0, 3 - shownQuotes.length));
  const estimateBeatsBest = Boolean(best?.recipientAmount != null && shownEstimates.some((row) => row.recipientAmount! > best.recipientAmount!));
  const amounts = options.map((row) => row.recipientAmount!);
  const spread = amounts.length > 1 ? Math.max(...amounts) - Math.min(...amounts) : 0;
  const receive = useTween(top?.recipientAmount ?? null);
  const midRate = result?.reference?.rate ?? null;
  const fromOption = currencies.find((option) => option.value === from);
  const toOption = currencies.find((option) => option.value === to);
  const query = new URLSearchParams({ from, to, amount: String(amount || ""), market: "1", ...context }).toString();
  const compareHref = `${compareBase}?${query}`;

  const load = useCallback(async () => {
    if (!valid) return;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoading(true);
    const q = new URLSearchParams({ from, to, amount: String(amount), market: "1", ...context });
    try {
      const res = await fetch(`/api/prices?${q}`, { signal: ctl.signal, cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as PriceCheckResult & { error?: string };
      if (controller.current !== ctl || ctl.signal.aborted) return;
      if (!res.ok) throw new Error(body.error ?? "Prices couldn’t load right now.");
      setResponse(body);
      setError("");
      setFetchedAt(Date.now());
    } catch (cause) {
      if (!ctl.signal.aborted && controller.current === ctl && (cause as Error).name !== "AbortError") {
        setError((cause as Error).message || "Prices couldn’t load right now.");
        setFetchedAt(Date.now());
      }
    } finally {
      if (controller.current === ctl) setLoading(false);
    }
  }, [valid, from, to, amount, context]);

  // Any change re-quotes after a short pause (typing doesn't fire a request per key).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (!initialResult && !initialError) void load();
      return;
    }
    controller.current?.abort();
    const timer = window.setTimeout(() => void load(), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, amountText, context]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!loading && valid && !error && document.visibilityState === "visible" && fetchedAt && now - fetchedAt >= REFRESH_SECONDS * 1000) void load();
  }, [now, fetchedAt, loading, valid, error, load]);
  useEffect(() => () => controller.current?.abort(), []);

  const setProfile = (profile: Profile) => setContext((previous) => contextFor(to, profile, entityCountry, previous));
  const pickTo = (code: string) => {
    if (code === from) return swap();
    setTo(code);
    setContext((previous) => contextFor(code, previous.profile as Profile, entityCountry, previous));
  };
  const pickFrom = (code: string) => (code === to ? swap() : setFrom(code));
  function swap() {
    setSpin((value) => value + 1);
    setFrom(to);
    setTo(from);
    setContext((previous) => contextFor(from, previous.profile as Profile, entityCountry, previous));
  }

  const activeProfile: Profile = context.profile === "sole_proprietor" ? "freelancer" : (context.profile as Profile);
  const amountDisplay = focused ? amountText : amount > 0 ? amount.toLocaleString("en-US", { maximumFractionDigits: 2 }) : amountText;
  const pending = loading || (valid && !result && !error);

  return (
    <div className={styles.quote} data-variant={variant}>
      {variant === "hero" ? (
        <div className={styles.stickers} aria-hidden>
          {toOption?.flag ? <span className="sticker-flag" style={{ "--tilt": "9deg", "--delay": ".55s", top: -18, right: 26 } as React.CSSProperties}><Flag code={toOption.flag} size={44} round /></span> : null}
          {fromOption?.flag ? <span className="sticker-flag" style={{ "--tilt": "-10deg", "--delay": ".45s", top: 92, left: -20 } as React.CSSProperties}><Flag code={fromOption.flag} size={36} round /></span> : null}
          {spread >= 1 ? (
            <span className="sticker" data-tone="gold" style={{ "--tilt": "-4deg", "--delay": ".8s", bottom: -14, left: 34 } as React.CSSProperties}>
              Prices differ by up to {money(spread, 0)} {to}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.progress} data-active={pending || undefined} aria-hidden />
        <div className={styles.cardHead}>
          <div role="group" aria-label="Who is this for" className={styles.segment}>
            {PROFILES.map((option) => (
              <button key={option.value} type="button" aria-pressed={activeProfile === option.value} onClick={() => setProfile(option.value)}>
                {activeProfile === option.value ? <motion.span layoutId={`${variant}-profile`} className={styles.segmentThumb} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.32, bounce: 0 }} /> : null}
                <span className={styles.segmentLabel}>{option.label}</span>
              </button>
            ))}
          </div>
          <span className={styles.live} title={`Prices refresh every ${REFRESH_SECONDS} seconds`}>
            <span aria-hidden className={styles.liveDot} data-loading={loading || undefined} />
            {fetchedAt ? `Updated ${ago(now - fetchedAt)}` : "Live prices"}
          </span>
        </div>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor={`${variant}-amount`} className={styles.fieldLabel}>Sending</label>
            <div className={styles.fieldRow}>
              <input
                id={`${variant}-amount`}
                inputMode="decimal"
                autoComplete="off"
                value={amountDisplay}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(event) => setAmountText(event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 11))}
                className={styles.amount}
                placeholder="0"
                aria-describedby={`${variant}-presets`}
              />
              <CurrencyPicker label="Sending currency" value={from} options={currencies} onChange={pickFrom} />
            </div>
            <div id={`${variant}-presets`} className={styles.presets} role="group" aria-label="Quick amounts">
              {PRESETS.map((preset) => (
                <button key={preset} type="button" className="press" aria-pressed={amount === preset} onClick={() => setAmountText(String(preset))}>
                  {preset.toLocaleString("en-US")}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className={`${styles.swap} press`} onClick={swap} aria-label={`Swap currencies: send ${to}, receive ${from}`}>
            <motion.span animate={{ rotate: spin * 180 }} transition={reduce ? { duration: 0 } : { duration: 0.32, ease: [0.77, 0, 0.175, 1] }} style={{ display: "grid" }}>
              <ArrowDownUp size={17} aria-hidden />
            </motion.span>
          </button>

          <div className={styles.field} data-output>
            <span className={styles.fieldLabel}>{topIsEstimate ? "Arrives (estimate)" : "Arrives"}</span>
            <div className={styles.fieldRow}>
              <output aria-live="polite" className={styles.amount} data-pending={pending || undefined}>
                {receive === null ? (pending ? "…" : "—") : money(receive)}
              </output>
              <CurrencyPicker label="Arriving currency" value={to} options={currencies} onChange={pickTo} />
            </div>
            <p className={styles.via}>
              {top ? (
                <>
                  via <strong>{top.providerName.split(" · ")[0]}</strong>
                  {top.feeAmount !== null ? <> · fee {money(top.feeAmount)} {top.feeCurrency ?? ""}</> : null}
                  {top.delivery ? <> · arrives {top.delivery}</> : null}
                </>
              ) : midRate ? <>Mid-market rate 1 {from} = {midRate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} {to}</> : <>&nbsp;</>}
            </p>
          </div>
        </div>

        {error ? (
          <div role="alert" className={styles.error}>
            <CircleAlert size={16} aria-hidden />
            <span>{error}</span>
            <button type="button" className="press" onClick={() => void load()}><RefreshCw size={13} aria-hidden />Try again</button>
          </div>
        ) : !valid ? (
          <p className={styles.hint}>{from === to ? "Pick two different currencies." : "Enter an amount above zero."}</p>
        ) : (
          <div className={styles.ranking}>
            <p className={styles.rankingTitle}>
              {options.length ? `Best options for ${activeProfile === "personal" ? "personal transfers" : activeProfile === "freelancer" ? "freelancers" : "businesses"}` : pending ? "Checking providers…" : "No usable price yet"}
            </p>
            <ol className={styles.rows} aria-busy={pending || undefined}>
              <AnimatePresence initial={false} mode="popLayout">
                {[...shownQuotes, ...shownEstimates].map((row, index) => {
                  const isBest = row === best;
                  const firstEstimate = row === shownEstimates[0];
                  return (
                    <motion.li
                      key={row.providerSlug}
                      layout={!reduce}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : index * 0.04 }}
                      className={styles.rowWrap}
                    >
                      {firstEstimate ? <p className={styles.rowDivider}>{shownQuotes.length ? "Estimates from comparison sites · may include first-transfer offers" : "Dated estimates · not guaranteed"}</p> : null}
                      <div className={styles.row} data-best={isBest || undefined}>
                        <ProviderLogo slug={row.providerSlug} name={row.providerName} src={row.logoUrl} size={30} />
                        <span className={styles.rowName}>
                          <strong>{row.providerName.split(" · ")[0]}</strong>
                          <small>{row.basis === "market_estimate" ? collected(row.observedAt, now) : `${BASIS_LABEL[row.basis]}${row.delivery ? ` · ${row.delivery}` : ""}`}</small>
                        </span>
                        <span className={styles.rowAmount}>
                          <strong>{money(row.recipientAmount)}</strong>
                          <small>{isBest ? <span className={styles.bestTag}>{estimateBeatsBest ? "Best live price" : "Best price"}</span> : row.shortfall && row.shortfall > 0 ? `−${money(row.shortfall)}` : row.basis === "market_estimate" ? <span className={styles.estimateTag}>Estimate</span> : ""}</small>
                        </span>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {!options.length && pending ? [0, 1, 2].map((key) => <li key={key} className={`${styles.row} ${styles.rowSkeleton}`} aria-hidden><span /><span /><span /></li>) : null}
              {!options.length && !pending ? (
                <li className={styles.empty}>No provider we track has a price this {activeProfile} profile can use for {from} → {to} yet.</li>
              ) : null}
            </ol>
            {excluded.length ? (
              <p className={styles.hidden}>{excluded.length} {excluded.length === 1 ? "option is" : "options are"} hidden — {excluded.length === 1 ? "it doesn’t" : "they don’t"} serve this profile.</p>
            ) : null}
          </div>
        )}

        <Link href={compareHref} className={`${styles.compare} press`} aria-disabled={!valid || undefined} onClick={(event) => { if (!valid) event.preventDefault(); }}>
          {options.length > 3 ? `Compare all ${options.length} options` : "See the full comparison"}
          <ArrowRight size={17} aria-hidden />
        </Link>
        <p className={styles.footnote}>
          {midRate ? <>Mid-market: 1 {from} = {midRate.toLocaleString("en-US", { maximumSignificantDigits: 6 })} {to}. </> : null}
          Every price shows its source. Confirm the final amount with the provider.
        </p>
      </div>
    </div>
  );
}

/** Same footprint as the calculator, so the hero doesn't jump when prices stream in. */
export function QuickQuoteSkeleton({ variant = "hero" }: { variant?: "hero" | "app" }) {
  return (
    <div className={styles.quote} data-variant={variant} aria-busy="true" aria-label="Loading prices">
      <div className={styles.card}>
        <div className={styles.progress} data-active aria-hidden />
        <div className={styles.cardHead}>
          <div className={styles.segment} aria-hidden>
            {PROFILES.map((option, index) => (
              <button key={option.value} type="button" disabled tabIndex={-1} aria-pressed={index === 0}>
                {index === 0 ? <span className={styles.segmentThumb} /> : null}
                <span className={styles.segmentLabel}>{option.label}</span>
              </button>
            ))}
          </div>
          <span className={styles.live}><span aria-hidden className={styles.liveDot} data-loading />Checking prices</span>
        </div>
        <div className={styles.fields}>
          <div className={styles.field}><span className={styles.fieldLabel}>Sending</span><div className={styles.fieldRow}><span className={styles.amount} data-pending>1,000</span></div><div className={styles.presets} style={{ height: 28 }} /></div>
          <div className={styles.field} data-output><span className={styles.fieldLabel}>Arrives</span><div className={styles.fieldRow}><span className={styles.amount} data-pending>…</span></div><p className={styles.via}>&nbsp;</p></div>
        </div>
        <div className={styles.ranking}>
          <p className={styles.rankingTitle}>Checking providers…</p>
          <ol className={styles.rows}>{[0, 1, 2].map((key) => <li key={key} className={`${styles.row} ${styles.rowSkeleton}`} aria-hidden><span /><span /><span /></li>)}</ol>
        </div>
        <span className={styles.compare} aria-disabled>See the full comparison<ArrowRight size={17} aria-hidden /></span>
      </div>
    </div>
  );
}
