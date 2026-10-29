import type { PriceCheckInput } from "../pricing.js";

/** Anonymous endpoint used by Mulya's own public calculator; no account or secret key. */
export async function mulyaPublicFx(input: PriceCheckInput, fetcher: typeof fetch, now: Date) {
  if (input.destinationCurrency !== "INR" || (input.destinationCountry && input.destinationCountry !== "IN") || !/^[A-Z]{3}$/.test(input.sourceCurrency) || input.sourceCurrency === "INR") return null;
  const source = `https://app.mulya.co/api/site/liveRate/${input.sourceCurrency}INR`;
  const response = await fetcher(source, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const age = response.headers.get("age");
  if (age && (!Number.isFinite(Number(age)) || Number(age) > 600)) return null;
  const served = response.headers.get("date");
  if (served && (!Number.isFinite(Date.parse(served)) || now.getTime() - Date.parse(served) > 600_000 || Date.parse(served) - now.getTime() > 60_000)) return null;
  const body: unknown = await response.json();
  const rate = body && typeof body === "object" && "details" in body && body.details && typeof body.details === "object" && "rate" in body.details ? body.details.rate : null;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  // This endpoint supplies no rate-publication timestamp. Expose retrieval time explicitly.
  return { rate, observedAt: now.toISOString(), source };
}
