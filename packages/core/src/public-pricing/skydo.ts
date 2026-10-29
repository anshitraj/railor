import type { PriceCheckInput } from "../pricing.js";

export const SKYDO_PUBLIC_FX_URL = "https://www.skydo.com/api/fxratelist";
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The public calculator publishes an IST wall-clock timestamp; never parse it in the server's timezone. */
export function skydoFxTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/);
  if (!parts) return null;
  const month = months.indexOf(parts[1]!); const day = Number(parts[2]), year = Number(parts[3]);
  const hour = Number(parts[4]), minute = Number(parts[5]), second = Number(parts[6]);
  if (month < 0 || day < 1 || day > new Date(Date.UTC(year, month + 1, 0)).getUTCDate() || hour < 1 || hour > 12 || minute > 59 || second > 59) return null;
  return new Date(Date.UTC(year, month, day, hour % 12 + (parts[7] === "PM" ? 12 : 0), minute - 330, second)).toISOString();
}

export async function skydoPublicFx(input: PriceCheckInput, fetcher: typeof fetch, now: Date) {
  if (input.destinationCurrency !== "INR" || (input.destinationCountry && input.destinationCountry !== "IN")) return null;
  const response = await fetcher(SKYDO_PUBLIC_FX_URL, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!Array.isArray(body)) return null;
  const valid = (row: Record<string, unknown> | undefined) => {
    if (!row || typeof row.fx_rate !== "number" || !Number.isFinite(row.fx_rate) || row.fx_rate <= 0) return null;
    const observedAt = skydoFxTime(row.api_timestamp);
    if (!observedAt || now.getTime() - Date.parse(observedAt) > 10 * 60_000 || Date.parse(observedAt) - now.getTime() > 60_000) return null;
    return { rate: row.fx_rate, observedAt };
  };
  const rate = valid(body.find((row) => row && row.base === input.sourceCurrency && row.target === "INR"));
  const usd = input.sourceCurrency === "USD" ? { rate: 1 } : valid(body.find((row) => row && row.base === input.sourceCurrency && row.target === "USD"));
  return rate && usd ? { ...rate, usdRate: usd.rate, source: SKYDO_PUBLIC_FX_URL } : null;
}
