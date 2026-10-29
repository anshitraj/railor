import { CorridorQuery, PaymentIntent, RankingPreset, intentToCorridorQuery } from "@railor/types";
/** Coverage exploration is a separate read-only path, never an implicit policy pass. */
export function exploreRouteHref(intent: unknown, preference: string = "balanced") {
  const query = intentToCorridorQuery(PaymentIntent.parse(intent));
  return `/app/corridors?${new URLSearchParams({ route: JSON.stringify(query), preset: RankingPreset.parse(preference) })}`;
}
export function parseExploreRoute(value: unknown) {
  if (typeof value !== "string" || value.length > 4000) return null;
  try { const parsed = CorridorQuery.safeParse(JSON.parse(value)); return parsed.success ? parsed.data : null; } catch { return null; }
}
