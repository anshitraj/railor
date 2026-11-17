export { Flag } from "./flag-image.js";

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
