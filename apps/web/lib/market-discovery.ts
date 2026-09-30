import { unstable_cache } from "next/cache";
import { CorridorQuery } from "@railor/types";
import { discoverMarket, saveDiscoveryReviews } from "@railor/core";

/**
 * Next's persistent data cache prevents filter toggles and repeated API calls
 * from turning paid web discovery into an unbounded request-time cost. The
 * normalized query is an argument, so each exact corridor receives its own
 * one-hour cache entry.
 */
const cachedDiscovery = unstable_cache(
  async (serializedQuery: string) => discoverMarket(CorridorQuery.parse(JSON.parse(serializedQuery))),
  ["railor-market-discovery-v1"],
  { revalidate: 3600 },
);

export function normalizedDiscoveryKey(query: unknown): string {
  const parsed = CorridorQuery.parse(query);
  return JSON.stringify(Object.fromEntries(Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b))));
}

export async function getCachedMarketDiscovery(query: unknown, organizationId?: string) {
  const result = await cachedDiscovery(normalizedDiscoveryKey(query));
  if (organizationId) await saveDiscoveryReviews(organizationId, query, result);
  return result;
}
