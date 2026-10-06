"use client";

import { CurrencyLogo } from "../marketing/currency-logo";
import { Flag } from "@railor/ui";

/** Every fiat currency the demo dataset knows, mapped to the country whose flag represents it. */
const CURRENCY_COUNTRY: Record<string, string> = {
  USD: "US",
  EUR: "EU",
  GBP: "GB",
  AED: "AE",
  INR: "IN",
  NGN: "NG",
  SGD: "SG",
  BRL: "BR",
};

/**
 * A route token — country, asset or currency — with its identifying badge on
 * the left: the asset's own mark for stablecoins, a flag for everything else
 * that has one. Used anywhere a corridor's IN → USDC → AE → AED shorthand
 * appears outside the full InterpretationBar.
 *
 * Fiat is a short, closed, known list (2-letter country codes, 3-letter
 * currency codes); anything else is treated as an asset symbol and gets
 * `CurrencyLogo`'s badge, bespoke or fallback — so a new stablecoin needs no
 * change here to render correctly.
 */
export function RoutePill({ value }: { value: string }) {
  const flagCountry = value.length === 2 ? value : CURRENCY_COUNTRY[value];
  const isAsset = !flagCountry;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--color-ink)]">
      {isAsset ? (
        <CurrencyLogo symbol={value} size={16} />
      ) : flagCountry ? (
        <Flag code={flagCountry} size={16} />
      ) : null}
      {value}
    </span>
  );
}
