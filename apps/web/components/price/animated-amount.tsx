"use client";

import NumberFlow from "@number-flow/react";
import { useState, type ComponentPropsWithoutRef } from "react";
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
