/**
 * The global route graph behind the map.
 *
 * A corridor is not a stored edge. Nothing in `provider_capabilities` carries
 * both an entity country and a destination country on one row — entity
 * eligibility and destination reach are separate facts, and a route only
 * exists where the engine finds both on the same provider. So this module
 * derives the graph the same way the corridor explorer derives one answer:
 * by running `evaluateProvider` over the real capability facets. The map can
 * therefore never show a route the explorer would disagree with.
 *
 * Provider inputs are loaded exactly once and every pair is evaluated against
 * that one snapshot — calling `searchCorridors` per pair would re-query the
 * whole capability graph a few hundred times over.
 */
import type { CorridorQuery, RankingPreset } from "@railor/types";
import { evaluateProvider, scoreProvider, type ProviderInput } from "./eligibility.js";
import { loadProviderInputs } from "./repository.js";

export interface RouteProviderRef {
  slug: string;
  name: string;
}

/**
 * The cheapest option on a route, and — when there isn't one — why not.
 * `feeBps` is only ever a number Railor actually holds a fee record for:
 * a provider with no published pricing is never quietly ranked cheapest,
 * because "we don't know" and "it's free" are not the same answer.
 */
export interface RouteCheapest {
  provider: RouteProviderRef;
  feeBps: number;
  feeSummary: string | null;
}

export interface GlobalRoute {
  entityCountry: string;
  destinationCountry: string;
  /** Providers that can serve this route outright. */
  supported: number;
  /** Providers that could, once the org clears outstanding requirements. */
  conditional: number;
  /** Highest-scoring supported provider under the requested preset. */
  best: RouteProviderRef | null;
  cheapest: RouteCheapest | null;
  /** Set when no supported provider on this route publishes a fee Railor can compare. */
  cheapestUnknownReason: string | null;
}

export interface GlobalRouteMap {
  routes: GlobalRoute[];
  entityCountries: string[];
  destinationCountries: string[];
  providersChecked: number;
  preset: RankingPreset;
  generatedAt: Date;
  /** Cheapest route across the whole graph, by fee — the "where is it cheapest to move money" answer. */
  cheapestOverall: (GlobalRoute & { cheapest: RouteCheapest }) | null;
}

function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/**
 * Evaluates one corridor against a preloaded provider snapshot.
 * Exported so a caller holding inputs already (the explorer, a test) can
 * reuse the exact same route arithmetic without a second database round trip.
 */
export function evaluateRoute(
  inputs: ProviderInput[],
  entityCountry: string,
  destinationCountry: string,
  preset: RankingPreset,
  now: Date,
): GlobalRoute {
  const query: CorridorQuery = {
    entityCountry,
    destinationCountry,
    customerType: "business",
  };

  let supported = 0;
  let conditional = 0;
  let best: RouteProviderRef | null = null;
  let bestScore = -Infinity;
  let cheapest: RouteCheapest | null = null;
  /** Supported providers that simply have no fee on record — drives the honest empty state. */
  let supportedWithoutPricing = 0;

  for (const provider of inputs) {
    const evaluation = evaluateProvider(provider, query, { now });

    if (evaluation.verdict === "additional_requirements") conditional += 1;
    if (evaluation.verdict !== "supported") continue;
    supported += 1;

    const { score } = scoreProvider(provider, evaluation, preset);
    if (score > bestScore) {
      bestScore = score;
      best = { slug: provider.slug, name: provider.name };
    }

    if (provider.feeCostBps === undefined) {
      supportedWithoutPricing += 1;
      continue;
    }
    if (!cheapest || provider.feeCostBps < cheapest.feeBps) {
      cheapest = {
        provider: { slug: provider.slug, name: provider.name },
        feeBps: provider.feeCostBps,
        feeSummary: provider.feeSummary ?? null,
      };
    }
  }

  let cheapestUnknownReason: string | null = null;
  if (!cheapest) {
    cheapestUnknownReason =
      supported === 0
        ? "No provider serves this route yet."
        : supportedWithoutPricing === 1
          ? "The one provider on this route publishes no comparable fee."
          : `None of the ${supportedWithoutPricing} providers on this route publish a comparable fee.`;
  }

  return {
    entityCountry,
    destinationCountry,
    supported,
    conditional,
    best,
    cheapest,
    cheapestUnknownReason,
  };
}

/**
 * Every corridor Railor can say anything about, for the global map.
 *
 * Routes with no coverage at all are dropped rather than drawn as dead
 * edges — an empty pair is the absence of a fact, not a fact. Coverage gaps
 * are still visible in the map's country totals and on /coverage.
 */
export async function buildGlobalRouteMap(
  options: { preset?: RankingPreset; now?: Date } = {},
): Promise<GlobalRouteMap> {
  const preset = options.preset ?? "balanced";
  const now = options.now ?? new Date();
  // Real companies only — the map is a truth surface, not a demo showcase;
  // a fabricated demo provider must never appear to move real money.
  const inputs = (await loadProviderInputs()).filter((p) => !p.isDemo);

  const entityCountries = distinct(inputs.flatMap((p) => p.facets.map((f) => f.entityCountry)));
  const destinationCountries = distinct(
    inputs.flatMap((p) => p.facets.map((f) => f.destinationCountry)),
  );

  const routes: GlobalRoute[] = [];
  for (const entity of entityCountries) {
    for (const destination of destinationCountries) {
      const route = evaluateRoute(inputs, entity, destination, preset, now);
      if (route.supported === 0 && route.conditional === 0) continue;
      routes.push(route);
    }
  }

  routes.sort(
    (a, b) =>
      b.supported - a.supported ||
      a.entityCountry.localeCompare(b.entityCountry) ||
      a.destinationCountry.localeCompare(b.destinationCountry),
  );

  const priced = routes.filter(
    (r): r is GlobalRoute & { cheapest: RouteCheapest } => r.cheapest !== null,
  );
  const cheapestOverall = priced.length
    ? priced.reduce((min, r) => (r.cheapest.feeBps < min.cheapest.feeBps ? r : min))
    : null;

  return {
    routes,
    entityCountries,
    destinationCountries,
    providersChecked: inputs.length,
    preset,
    generatedAt: now,
    cheapestOverall,
  };
}
