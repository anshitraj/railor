"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { useState, type ComponentPropsWithoutRef } from "react";
import type { BenchmarkCost } from "../../lib/price-cost";
import styles from "./animated-amount.module.css";

const amountFormat = { maximumFractionDigits: 20 };
const priceFormat = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const formatters = {
  "en-US": new Intl.NumberFormat("en-US", priceFormat),
  "en-IN": new Intl.NumberFormat("en-IN", priceFormat),
};
type PriceLocale = keyof typeof formatters;
const timing = { duration: 620, easing: "cubic-bezier(.30, .65, .35, 1)" };

export function RollingPrice({ value, locale = "en-US" }: { value: number; locale?: PriceLocale }) {
  return <>
    <span className="sr-only">{formatters[locale].format(value)}</span>
    <span aria-hidden><NumberFlow value={value} locales={locale} format={priceFormat} transformTiming={timing} /></span>
  </>;
}

/** Keep the previous digit positions during a fetch. Only the placeholder is exposed until a matching quote arrives. */
export function QuoteAmount({ value, identity, placeholder, locale }: {
  value: number | null;
  identity?: string;
  placeholder: string;
  locale?: PriceLocale;
}) {
  const [previous, setPrevious] = useState({ value, identity });
  if (value !== null && (value !== previous.value || identity !== previous.identity)) {
    setPrevious({ value, identity });
  }
  const digits = value ?? previous.value;
  return <>
    {digits !== null && <span className={value === null ? styles.pendingDigits : undefined} aria-hidden={value === null || undefined}>
      <RollingPrice key={value === null ? previous.identity : identity} value={digits} locale={locale} />
    </span>}
    {value === null && placeholder}
  </>;
}

type AmountInputProps = Pick<ComponentPropsWithoutRef<"input">, "id" | "aria-describedby" | "className" | "onChange"> & { value: string };

export function AmountInput({ value, className, ...props }: AmountInputProps) {
  const [editing, setEditing] = useState(false);
  const amount = Number(value);
  const showDigits = value !== "" && Number.isFinite(amount);
  return <span className={`${className} ${styles.field}`} data-roll={showDigits || undefined}>
    <input {...props} value={value} inputMode="decimal" autoComplete="off" placeholder="0"
      onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} />
    {showDigits && <span aria-hidden className={styles.digits}>
      <NumberFlow value={amount} locales="en-US" format={amountFormat} animated={!editing} transformTiming={timing} />
    </span>}
  </span>;
}

/** Any figure in a quote rolls to its new value the same way the payout does. Screen readers get the plain text. */
const TWO = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
const plain = (value: number, format: Format, prefix = "", suffix = "") => `${prefix}${new Intl.NumberFormat("en-US", format).format(value)}${suffix}`;

export function RollingNumber({ value, format = TWO, prefix, suffix }: { value: number; format?: Format; prefix?: string; suffix?: string }) {
  return <>
    <span className="sr-only">{plain(value, format, prefix, suffix)}</span>
    <span aria-hidden><NumberFlow value={value} locales="en-US" format={format} prefix={prefix} suffix={suffix} transformTiming={timing} /></span>
  </>;
}

/** "9.00 EUR · 0.99%": the cost against mid-market, both parts rolling. */
export function RollingCost({ cost, unit = "percent" }: { cost: BenchmarkCost; unit?: "bps" | "percent" }) {
  const symbol = cost.currency === "INR" ? "₹" : "";
  const value = Math.abs(cost.costMinor) / 100;
  const digits = value >= 100 ? 0 : 2;
  return <>
    <RollingNumber value={value} format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }} prefix={symbol || undefined} suffix={symbol ? undefined : ` ${cost.currency}`} />
    {cost.costMinor < 0 ? " better" : ""} · {unit === "percent"
      ? <RollingNumber value={cost.bps / 10_000} format={{ style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
      : <RollingNumber value={cost.bps} format={{ maximumFractionDigits: 0 }} suffix=" bps" />}
  </>;
}

/** "€8.99 below mid-market". */
export function RollingPayoutDifference({ difference }: { difference: BenchmarkCost }) {
  if (!difference.costMinor) return <>At mid-market</>;
  return <>
    <RollingNumber value={Math.abs(difference.costMinor) / 100} format={{ style: "currency", currency: difference.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
    {difference.costMinor < 0 ? " above" : " below"} mid-market
  </>;
}

/** "+0.99%" / "−0.12%" from basis points. */
export function RollingPercent({ bps }: { bps: number }) {
  return <RollingNumber value={Math.abs(bps) / 100} format={TWO} prefix={bps < 0 ? "−" : bps > 0 ? "+" : undefined} suffix="%" />;
}

/** An exchange rate at six significant digits, as the rest of the page prints it. */
export function RollingRate({ value }: { value: number }) {
  return <RollingNumber value={value} format={{ maximumSignificantDigits: 6 }} />;
}
