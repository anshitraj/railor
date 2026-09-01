/**
 * Corridor search: query in, ranked provider verdicts with provenance out.
 * This is the single code path behind the public search, the dashboard's
 * corridor explorer, the REST API and the MCP server — one answer everywhere.
 */
import type {
  CorridorQuery,
  CorridorSearchResult,
  ProviderResult,
  RankingPreset,
} from "@railor/types";
import { connectivityFor, loadConnectionStatuses } from "./connectivity.js";
import { recordSearchTelemetry } from "./coverage-gaps.js";
import { evaluateProvider, scoreProvider, settlementMinutes } from "./eligibility.js";
import { loadCountryProfile, loadProviderInputs } from "./repository.js";
import { PRODUCT_TERMS } from "./vocab.js";

async function loadCountryContext(iso2: string | undefined) {
  if (!iso2) return null;
  const profile = await loadCountryProfile(iso2);
  if (!profile) return null;
  return {
    iso2: profile.iso2,
    countryName: profile.countryName,
    cryptoStatus: profile.cryptoStatus,
    stablecoinStatus: profile.stablecoinStatus,
    instantPaymentSystem: profile.instantPaymentSystem,
    localPaymentRails: profile.localPaymentRails,
    kycRequirements: profile.kycRequirements,
    kybRequirements: profile.kybRequirements,
    amlRequirements: profile.amlRequirements,
    crossBorderRestrictions: profile.crossBorderRestrictions,
    lastResearchedAt: profile.lastResearchedAt,
  };
}

export interface SearchOptions {
  preset?: RankingPreset;
  /** Requirement keys the org already holds — turns "supported" into a real answer. */
  satisfiedRequirements?: string[];
  /** Cap the result list (public preview shows a subset). */
  limit?: number;
  now?: Date;
  /**
   * Real Railor companies only, by default — Railor's own seeded demo
   * providers (fabricated names, fabricated health_checks) never mix into a
   * real search unless a caller explicitly opts in for a demo-tour
   * experience. This is the fix for the search path silently blending fake
   * companies' made-up reliability data into real rankings.
   */
  includeDemoProviders?: boolean;
  /** When provided, `connectivity` reflects this org's real provider_connections rows instead of capping at "compatible". */
  organizationId?: string;
}

export async function searchCorridors(
  query: CorridorQuery,
  options: SearchOptions = {},
): Promise<CorridorSearchResult> {
  const preset = options.preset ?? "balanced";
  const [allInputs, countryContext, connectionStatuses] = await Promise.all([
    loadProviderInputs(),
    loadCountryContext(query.destinationCountry),
    options.organizationId ? loadConnectionStatuses(options.organizationId) : Promise.resolve(new Map<string, string>()),
  ]);
  const inputs = options.includeDemoProviders ? allInputs : allInputs.filter((p) => !p.isDemo);
  const now = options.now ?? new Date();

  const results: ProviderResult[] = inputs.map((provider) => {
    const evaluation = evaluateProvider(provider, query, {
      satisfiedRequirements: options.satisfiedRequirements,
      now,
    });
    const { score, rankingConfidence, rankingInputsUsed, rankingInputsMissing } = scoreProvider(provider, evaluation, preset);
    const minutes = settlementMinutes(provider.advertisedSettlement);

    return {
      provider: {
        id: provider.id,
        slug: provider.slug,
        name: provider.name,
        category: provider.category,
        isDemo: provider.isDemo,
      },
      eligibility: evaluation.verdict,
      confidence: evaluation.confidence,
      band: evaluation.band,
      lastVerifiedAt: evaluation.lastVerifiedAt,
      reasons: evaluation.reasons,
      outstandingRequirements: evaluation.outstandingRequirements.map(
        (k) => provider.requirementLabels[k] ?? k,
      ),
      facts: {
        productLabel:
          PRODUCT_TERMS.find((p) => p.product === evaluation.matchedProduct)?.label ??
          evaluation.matchedProduct ??
          undefined,
        feeSummary: provider.feeSummary,
        limitSummary: provider.limitSummary,
        settlementSummary: provider.advertisedSettlement
          ? `${provider.advertisedSettlement}${minutes ? "" : " (not quantified)"}`
          : undefined,
        kybSummary: provider.onboardingDays
          ? `${provider.requirementKeys.length} required documents · ~${provider.onboardingDays} days`
          : `${provider.requirementKeys.length} required documents`,
      },
      evidence: evaluation.evidence,
      score,
      rankingConfidence,
      rankingInputsUsed,
      rankingInputsMissing,
      connectivity: connectivityFor(provider.slug, evaluation.verdict, connectionStatuses.get(provider.id)),
      receivingMode: evaluation.receivingMode,
      operationalReadiness: evaluation.operationalReadiness,
    } satisfies ProviderResult;
  });

  const order: Record<ProviderResult["eligibility"], number> = {
    supported: 0,
    additional_requirements: 1,
    unknown: 2,
    unavailable: 3,
  };
  results.sort(
    (a, b) => order[a.eligibility] - order[b.eligibility] || b.score - a.score,
  );

  const counts = {
    supported: results.filter((r) => r.eligibility === "supported").length,
    additional_requirements: results.filter((r) => r.eligibility === "additional_requirements")
      .length,
    unavailable: results.filter((r) => r.eligibility === "unavailable").length,
    unknown: results.filter((r) => r.eligibility === "unknown").length,
  };

  // Real customer intent only — a demo-tour search isn't real demand, and
  // recording it would pollute the one signal this exists to keep honest.
  if (!options.includeDemoProviders) {
    await recordSearchTelemetry(query, corridorKey(query), results);
  }

  return {
    query,
    preset,
    providersChecked: inputs.length,
    counts,
    results: options.limit ? results.slice(0, options.limit) : results,
    generatedAt: now,
    countryContext,
  };
}

/** Stable key for a corridor, used for saved corridors and observations. */
export function corridorKey(query: CorridorQuery): string {
  return [
    query.entityCountry ?? "any",
    query.customerType ?? "business",
    query.sourceAsset ?? "any",
    query.sourceNetwork ?? "any",
    query.sourceCurrency ?? "any",
    query.destinationCountry ?? "any",
    query.destinationCurrency ?? "any",
    query.paymentMethod ?? "any",
  ].join(":");
}

/** Human label for a corridor: "IN → AE · USDC → AED · Business". */
export function corridorLabel(query: CorridorQuery): string {
  const left = [query.entityCountry, query.destinationCountry].filter(Boolean).join(" → ");
  const assets = [query.sourceAsset ?? query.sourceCurrency, query.destinationCurrency].filter(Boolean).join(" → ");
  const who = query.customerType === "individual" ? "Individual" : "Business";
  return [left, assets, who].filter(Boolean).join(" · ");
}
