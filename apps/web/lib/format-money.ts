/** Money and dates as people read them: ₹1,56,952.26 for rupees, $1,700.00 for dollars. Safe in the browser and on the server. */
export function money(amount: number, currency: string, digits = 2) {
  try {
    const symbol = currency === "INR" || currency === "USD" || currency === "EUR" || currency === "GBP";
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, currencyDisplay: symbol ? "narrowSymbol" : "code", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount).replace(/ /g, " ");
  } catch { return `${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`; }
}

export const signed = (amount: number, currency: string) => `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${money(Math.abs(amount), currency)}`;

export const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Decimal places a currency holds: 2 for rupees and dollars, 0 for yen. */
export function currencyDecimals(currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
}

/** "gemini-4-argon" → "Gemini 4 Argon". */
export function modelLabel(name: string) {
  return name.split("-").map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1))).join(" ");
}
