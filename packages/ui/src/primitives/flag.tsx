import { cn } from "../cn.js";

/**
 * A country flag as a real image (served from the app's own /flags/XX.svg).
 * Flag *emoji* are not used anywhere: Windows renders them as two bare letters
 * ("IN", "US"), which is exactly what a picker must never show.
 *
 * `code` is an ISO 3166-1 alpha-2 code (or EU). Unknown codes render nothing
 * rather than a broken image.
 */
export function Flag({
  code,
  size = 16,
  round = false,
  className,
  base = "/flags",
}: {
  code: string;
  /** Height in px; flags are 3:2, so width is 1.5× — or equal to size when `round`. */
  size?: number;
  round?: boolean;
  className?: string;
  base?: string;
}) {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static same-origin SVG; next/image adds nothing for vectors
    <img
      src={`${base}/${clean}.svg`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      width={round ? size : Math.round(size * 1.5)}
      height={size}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
      className={cn("inline-block shrink-0 bg-[var(--color-canvas)] object-cover shadow-[0_0_0_1px_rgba(28,27,25,.14)]", round ? "rounded-full" : "rounded-[3px]", className)}
    />
  );
}

/**
 * The flag of the country that issues a currency, from the ISO 4217 rule that
 * a currency's first two letters are its country (USD→US, INR→IN, GBP→GB). The
 * euro is the EU's, and X-codes (gold, CFA francs…) have no single country.
 */
export function currencyFlagCode(currency: string): string | null {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || code.startsWith("X")) return null;
  return code === "EUR" ? "EU" : code.slice(0, 2);
}
