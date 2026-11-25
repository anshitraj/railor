/**
 * Where people send money, and the link that opens Convert currencies with
 * that country already chosen. Pure data and string work, so menus and pages
 * share it.
 */

export interface Destination {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** ISO 4217 currency the money arrives in. */
  currency: string;
}

/** Countries people most often send money to, in the order a menu shows them. */
export const POPULAR_DESTINATIONS: readonly Destination[] = [
  { code: "IN", name: "India", currency: "INR" },
  { code: "PH", name: "Philippines", currency: "PHP" },
  { code: "MX", name: "Mexico", currency: "MXN" },
  { code: "PK", name: "Pakistan", currency: "PKR" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "DO", name: "Dominican Republic", currency: "DOP" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "ES", name: "Spain", currency: "EUR" },
  { code: "TR", name: "Türkiye", currency: "TRY" },
  { code: "EG", name: "Egypt", currency: "EGP" },
  { code: "CO", name: "Colombia", currency: "COP" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "QA", name: "Qatar", currency: "QAR" },
  { code: "TW", name: "Taiwan", currency: "TWD" },
  { code: "CM", name: "Cameroon", currency: "XAF" },
];

/** Euro-area members: the currency table knows the euro by Germany alone, so the rest are named here. */
const EURO_AREA = new Set(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]);

/** A country's currency: the reference table first, then the euro area, then the popular list. */
export function currencyForCountry(code: string, currencyByCountry: Readonly<Record<string, string>>): string | undefined {
  const upper = code.toUpperCase();
  return currencyByCountry[upper] ?? (EURO_AREA.has(upper) ? "EUR" : POPULAR_DESTINATIONS.find((destination) => destination.code === upper)?.currency);
}

/**
 * The destinations Railor can actually price right now: a country is listed
 * only when its currency is in the reference data, so a link never lands on a
 * calculator that silently swaps in a different currency.
 */
export function resolveDestinations(
  countries: ReadonlyArray<{ value: string; label: string }>,
  currencies: ReadonlyArray<{ value: string }>,
  currencyByCountry: Readonly<Record<string, string>>,
): { popular: Destination[]; all: Destination[] } {
  const known = new Set(currencies.map((currency) => currency.value.toUpperCase()));
  const names = new Map(countries.map((country) => [country.value.toUpperCase(), country.label]));
  // A country counts only if the calculator's own pickers know it, under the name they show.
  const make = (code: string): Destination | null => {
    const currency = currencyForCountry(code, currencyByCountry);
    const name = names.get(code);
    return currency && name && known.has(currency) ? { code, name, currency } : null;
  };
  const popular = POPULAR_DESTINATIONS.map((destination) => make(destination.code)).filter((destination): destination is Destination => destination !== null);
  const all = [...names.keys()].map((code) => make(code)).filter((destination): destination is Destination => destination !== null)
    // US is where the money starts in these guides, so it is not a destination.
    .filter((destination) => destination.code !== "US")
    .sort((a, b) => a.name.localeCompare(b.name));
  return { popular, all };
}

/**
 * A link written for visitors, adjusted for someone signed in: the public
 * calculator becomes their workspace page, and the sender details a visitor
 * has to be assumed to have are dropped so their own profile applies.
 */
export function linkForViewer(href: string, signedIn: boolean): string {
  if (!signedIn || !/^\/prices(\?|$)/.test(href)) return href;
  const [, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  for (const key of ["profile", "country", "purpose", "market"]) params.delete(key);
  const rest = params.toString();
  return `/app/prices${rest ? `?${rest}` : ""}`;
}

export interface ConvertOptions {
  signedIn: boolean;
  /** The currency the money starts in. Guides assume US dollars. */
  from?: string;
  amount?: number;
}

/**
 * Convert currencies with the country, its currency and a sensible amount
 * already chosen. Signed-in people go to their workspace page (it keeps their
 * own profile); visitors go to the public calculator as a personal sender in
 * the US.
 */
export function convertHref(destination: Pick<Destination, "code" | "currency">, { signedIn, from = "USD", amount = 1000 }: ConvertOptions): string {
  const query = new URLSearchParams({ from, to: destination.currency, amount: String(amount), destinationCountry: destination.code, direction: "send" });
  if (!signedIn) {
    query.set("profile", "personal");
    query.set("country", "US");
    query.set("purpose", "personal");
    query.set("market", "1");
  }
  return `${signedIn ? "/app/prices" : "/prices"}?${query}`;
}
