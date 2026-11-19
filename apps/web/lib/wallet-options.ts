/**
 * Wallet choices shared by the server and the browser. Every amount the
 * wallet offers is a fixed choice, so nothing here is typed by hand.
 */
export const TOP_UP_AMOUNTS_CENTS = [1000, 2500, 5000, 10000] as const;
export const AUTO_RELOAD_THRESHOLDS_CENTS = [500, 1000, 2500] as const;
export const AUTO_RELOAD_AMOUNTS_CENTS = [1000, 2500, 5000, 10000] as const;

export const WALLET_RANGES = {
  all: "All time",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
} as const;
export type WalletRange = keyof typeof WALLET_RANGES;

export function parseWalletRange(value: string | string[] | undefined | null): WalletRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && Object.prototype.hasOwnProperty.call(WALLET_RANGES, raw) ? (raw as WalletRange) : "all";
}

/** The earliest moment a range includes, or null for "All time". */
export function walletRangeStart(range: WalletRange, now = new Date()): Date | null {
  if (range === "30d") return new Date(now.getTime() - 30 * 86_400_000);
  if (range === "90d") return new Date(now.getTime() - 90 * 86_400_000);
  if (range === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

/** "$5.00", "−$1.20" (a true minus sign), "+$25.00" from integer cents. */
export function formatCents(cents: number, options: { signed?: boolean } = {}): string {
  const abs = Math.abs(Math.trunc(cents));
  const text = `$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  if (cents < 0) return `−${text}`;
  return options.signed && cents > 0 ? `+${text}` : text;
}

/** "$25" for whole-dollar choices, "$2.50" otherwise. */
export function formatChoice(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : formatCents(cents);
}

export interface AutoReloadPreference {
  enabled: boolean;
  thresholdCents: number;
  amountCents: number;
}

export const DEFAULT_AUTO_RELOAD: AutoReloadPreference = { enabled: false, thresholdCents: 500, amountCents: 2500 };
