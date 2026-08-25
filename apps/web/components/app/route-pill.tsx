import { CurrencyLogo } from "../marketing/currency-logo";

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
 * Unicode regional-indicator flags work for any ISO alpha-2 code with no
 * per-country artwork to maintain — unlike a hand-drawn SVG set, a country
 * this dataset adds tomorrow renders correctly today.
 */
function flagEmoji(code: string): string {
  if (code === "EU") return "🇪🇺";
  if (!/^[A-Za-z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

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
        <span
          aria-hidden
          className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-canvas)] text-[11px] leading-none"
        >
          {flagEmoji(flagCountry)}
        </span>
      ) : null}
      {value}
    </span>
  );
}
