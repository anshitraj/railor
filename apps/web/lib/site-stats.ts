import "server-only";
import { count, gte } from "drizzle-orm";
import { loadProviderInputs, remittanceProviderCatalog, type ProviderInput } from "@railor/core";
import { getDb, quoteSnapshots } from "@railor/database";

/**
 * The numbers the landing page shows. Every one is counted from Railor's own
 * provider and price records, never typed in: a figure that can't be counted is
 * left out rather than guessed.
 */
export interface SiteStats {
  /** Providers on file, the same count the rest of the page uses. */
  providers: number;
  /** Destination countries where at least one real provider is supported or partial. */
  countries: number;
  /** Payout currencies across those routes. */
  currencies: number;
  /** Sender-country to destination-country pairs at least one provider serves. */
  routes: number;
  /** Prices Railor recorded in the last 24 hours; null when that can't be counted. */
  pricesLast24h: number | null;
}

/** The coverage counts from the capability graph. Demo companies never count as coverage. */
export function coverageCounts(inputs: readonly Pick<ProviderInput, "isDemo" | "facets">[]): Pick<SiteStats, "countries" | "currencies" | "routes"> {
  const countries = new Set<string>();
  const currencies = new Set<string>();
  const routes = new Set<string>();
  for (const provider of inputs) {
    if (provider.isDemo) continue;
    for (const facet of provider.facets) {
      if (facet.availability !== "supported" && facet.availability !== "partial") continue;
      if (facet.destinationCountry) countries.add(facet.destinationCountry);
      if (facet.destinationCurrency) currencies.add(facet.destinationCurrency);
      if (facet.entityCountry && facet.destinationCountry) routes.add(`${facet.entityCountry}>${facet.destinationCountry}`);
    }
  }
  return { countries: countries.size, currencies: currencies.size, routes: routes.size };
}

const TTL_MS = 10 * 60_000;
let cached: { at: number; value: SiteStats } | null = null;

export async function siteStats(now = Date.now()): Promise<SiteStats> {
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const providers = remittanceProviderCatalog().length;
  const [coverage, prices] = await Promise.all([
    loadProviderInputs().then(coverageCounts).catch(() => null),
    getDb()
      .then(async (db) => (await db.select({ total: count() }).from(quoteSnapshots).where(gte(quoteSnapshots.observedAt, new Date(now - 24 * 60 * 60_000))))[0]?.total ?? 0)
      .catch(() => null),
  ]);
  const value: SiteStats = { providers, countries: coverage?.countries ?? 0, currencies: coverage?.currencies ?? 0, routes: coverage?.routes ?? 0, pricesLast24h: prices === null ? null : Number(prices) };
  // A failed count is not cached for long: try again on the next visit.
  cached = coverage ? { at: now, value } : { at: now - TTL_MS + 30_000, value };
  return value;
}
