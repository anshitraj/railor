/**
 * The eligibility engine.
 *
 * Given a corridor query and one provider's capability facets, it returns a
 * verdict *with its reasoning*: what passed, what failed, what is nonetheless
 * true, and what the user could change. Railor never renders a bare
 * "Unsupported", so the engine never returns one.
 *
 * Rules that must hold:
 *   1. A missing fact is `unknown`, not `unsupported`.
 *   2. An explicit `unsupported` facet always beats a `supported` one.
 *   3. Confidence is the *minimum* over the facets a verdict depends on,
 *      decayed by how long ago each was verified.
 */
import {
  confidenceBand,
  decayConfidence,
  type ConfidenceBand,
  type CorridorQuery,
  type EligibilityReason,
  type EligibilityVerdict,
  type EntityEligibility,
  type Evidence,
  type OperationalReadiness,
  type RankingPreset,
  type RouteConfirmation,
  type SourceType,
  type VerificationType,
} from "@railor/types";
import { COUNTRY_TERMS, METHOD_TERMS, PRODUCT_TERMS } from "./vocab.js";

export interface CapabilityFacet {
  id: string;
  product: string;
  entityCountry: string | null;
  customerCountry: string | null;
  customerType: string | null;
  sourceCountry: string | null;
  sourceEndpointType: string | null;
  sourceNamedRail: string | null;
  sourceAsset: string | null;
  sourceNetwork: string | null;
  sourceCurrency: string | null;
  destinationCountry: string | null;
  destinationCurrency: string | null;
  paymentMethod: string | null;
  availability: "supported" | "partial" | "unsupported" | "unknown";
  note: string | null;
  lastVerifiedAt: Date | null;
  evidenceConfidence: number | null;
  evidenceSourceType: SourceType | null;
  evidenceVerificationType: VerificationType | null;
  evidenceId: string | null;
  evidenceUrl: string | null;
  evidenceTitle: string | null;
  evidenceRetrievedAt: Date | null;
  evidenceRawHash: string | null;
  evidenceExcerpt: string | null;
  /** True only for one provider_routes row whose evidence states the full tuple. */
  isAtomicRoute?: boolean;
  /**
   * Only set on facets derived from `receiving_endpoints` — how the money
   * actually lands for the recipient, a distinct question from whether the
   * corridor is merely "supported" (the Skydo-vs-Xflow distinction).
   */
  stablecoinMode?: string | null;
  endpointType?: string | null;
  namedRailCode?: string | null;
  namedRailName?: string | null;
  settlementEstimate?: string | null;
  complianceDocs?: string | null;
}

export interface ProviderInput {
  id: string;
  slug: string;
  name: string;
  category: string;
  /** True for Railor's own seeded demo companies — never a real business. */
  isDemo: boolean;
  products: string[];
  facets: CapabilityFacet[];
  advertisedSettlement: string | null;
  onboardingDays: number | null;
  hasApi: boolean;
  hasSandbox: boolean;
  lastVerifiedAt: Date | null;
  /** Rolled up from provider tables so the engine stays synchronous. */
  feeSummary?: string;
  feeCostBps?: number;
  limitSummary?: string;
  limitMin?: number;
  limitMax?: number;
  requirementKeys: string[];
  requirementLabels: Record<string, string>;
  /** null when Railor has zero health-check observations for this provider — never defaulted to a fabricated "1.0 = perfectly healthy". See scoreProvider's norm(). */
  healthOkRatio: number | null;
  destinationCountryCount: number;
}

export interface EvaluationOptions {
  /** Requirement keys the organization already holds, from its KYB profile. */
  satisfiedRequirements?: string[];
  now?: Date;
  /** Incident/conformance state. Never upgrades an evidence verdict. */
  operationalReadiness?: OperationalReadiness;
}

/** How the money actually lands, when a `receiving_endpoints` fact decided the corridor. */
export interface ReceivingModeInfo {
  stablecoinMode: string;
  endpointType: string | null;
  namedRail: string | null;
  settlementEstimate: string | null;
  complianceDocs: string | null;
}

export interface Evaluation {
  verdict: EligibilityVerdict;
  confidence: number;
  band: ConfidenceBand;
  reasons: EligibilityReason[];
  outstandingRequirements: string[];
  lastVerifiedAt: Date | null;
  matchedProduct: string | null;
  /** Exactly the sources this verdict rests on — deduped, never decorative. */
  evidence: Evidence[];
  receivingMode: ReceivingModeInfo | null;
  operationalReadiness: OperationalReadiness;
  /** Set only when the query asked for a full route — see RouteConfirmation's doc comment in @railor/types. Deliberately never depends on entityCountry — see EntityEligibility's doc comment for why jurisdiction is tracked as its own, separate fact instead of a required dimension of the atomic route tuple. */
  routeConfirmation: RouteConfirmation | null;
  confirmedDimensions: string[];
  unconfirmedDimensions: string[];
  /** The provider_routes.id of the atomic row that produced routeConfirmation, when one atomic row settled it either way ("confirmed" or "unsupported") — null for partially_confirmed/unconfirmed/unknown, which by definition have no single atomic row to point at. Purely additive: not read by any existing caller, added for decision-engine.ts to record exactly which route fact a Decision depended on. */
  dependedOnRouteId: string | null;
  /** Set only when the query named an entity country — the entity-jurisdiction section's own sub-verdict, exposed separately from `verdict` (which still folds it in, unchanged, for every existing caller). See EntityEligibility in @railor/types. */
  entityEligibility: EntityEligibility | null;
}

/**
 * Human labels for query dimension keys, used only in route-confirmation
 * reasoning text. Deliberately excludes entityCountry — jurisdiction is not
 * a transport-route dimension, it is its own fact (EntityEligibility,
 * computed separately below and reported through its own field, not through
 * confirmedDimensions/unconfirmedDimensions).
 */
const DIMENSION_LABEL: Record<string, string> = {
  sourceCountry: "funding country",
  customerType: "customer type",
  sourceAsset: "source asset",
  sourceNetwork: "source network",
  sourceCurrency: "funding currency",
  sourceEndpointType: "funding endpoint",
  sourceNamedRail: "funding rail",
  destinationCountry: "destination country",
  destinationCurrency: "destination currency",
  paymentMethod: "payment method",
  endpointType: "receiving endpoint",
  namedRail: "named rail",
};

/** The dimensions a "full route" request can name — see routeDimensionsRequested below. */
const ROUTE_DIMENSION_KEYS = Object.keys(DIMENSION_LABEL) as Array<keyof typeof DIMENSION_LABEL>;

/** First depended-on facet that carries a receiving-endpoint mode, if any. */
function receivingModeFrom(facets: CapabilityFacet[]): ReceivingModeInfo | null {
  const withMode = facets.find((f) => f.stablecoinMode);
  if (!withMode?.stablecoinMode) return null;
  return {
    stablecoinMode: withMode.stablecoinMode,
    endpointType: withMode.endpointType ?? null,
    namedRail: withMode.namedRailName ?? withMode.namedRailCode ?? null,
    settlementEstimate: withMode.settlementEstimate ?? null,
    complianceDocs: withMode.complianceDocs ?? null,
  };
}

/** Evidence for the facets a verdict depended on, deduped by source URL. */
function collectEvidence(facets: CapabilityFacet[]): Evidence[] {
  const byUrl = new Map<string, Evidence>();
  for (const f of facets) {
    if (!f.evidenceUrl || !f.evidenceTitle) continue;
    if (byUrl.has(f.evidenceUrl)) continue;
    byUrl.set(f.evidenceUrl, {
      id: f.evidenceId ?? undefined,
      sourceUrl: f.evidenceUrl,
      sourceTitle: f.evidenceTitle,
      sourceType: f.evidenceSourceType ?? "official_docs",
      verificationType: f.evidenceVerificationType ?? "provider_reported",
      retrievedAt: f.evidenceRetrievedAt ?? f.lastVerifiedAt ?? new Date(),
      lastVerifiedAt: f.lastVerifiedAt ?? new Date(),
      confidence: f.evidenceConfidence ?? 0.6,
      rawExcerpt: f.evidenceExcerpt ?? undefined,
      rawHash: f.evidenceRawHash ?? "",
    });
  }
  return [...byUrl.values()];
}

const countryName = (code?: string | null) =>
  COUNTRY_TERMS.find((c) => c.code === code)?.name ?? code ?? "this market";
const productLabel = (p?: string | null) =>
  PRODUCT_TERMS.find((x) => x.product === p)?.label ?? p ?? "this product";
const methodLabel = (m?: string | null) =>
  METHOD_TERMS.find((x) => x.method === m)?.label ?? m ?? "this rail";
/** No static vocab table needed — receiving_endpoint_type values are already short enough to prettify inline. */
const endpointLabel = (t?: string | null) => (t ? t.replace(/_/g, " ") : "this endpoint type");

/** Facet families — a facet asserts only about the dimensions it names. */
type Family = "entity" | "customer_type" | "asset" | "network" | "source_currency" | "corridor" | "other";

function familyOf(f: CapabilityFacet): Family {
  if (f.entityCountry) return "entity";
  if (f.destinationCountry) return "corridor";
  if (f.sourceAsset) return "asset";
  if (f.sourceNetwork) return "network";
  if (f.sourceCurrency) return "source_currency";
  if (f.customerType) return "customer_type";
  return "other";
}

function facetConfidence(f: CapabilityFacet, now: Date): number {
  const base = f.evidenceConfidence ?? 0.6;
  if (!f.lastVerifiedAt) return base * 0.8;
  return decayConfidence(base, f.lastVerifiedAt, f.evidenceSourceType ?? "official_docs", now);
}

/**
 * Products that serve the same user need, so a provider filing its
 * stablecoin-to-bank product under "payout" still answers an "off-ramp"
 * question. The matched product is reported back, so nothing is hidden.
 */
const PRODUCT_FAMILY: Record<string, string[]> = {
  off_ramp: ["off_ramp", "payout"],
  payout: ["payout", "off_ramp"],
  on_ramp: ["on_ramp", "collection"],
  collection: ["collection", "virtual_account"],
  virtual_account: ["virtual_account", "collection"],
  card_issuing: ["card_issuing"],
  card_funding: ["card_funding", "card_issuing"],
  wallet: ["wallet", "treasury"],
  treasury: ["treasury", "wallet"],
  kyc_kyb: ["kyc_kyb"],
};

/** Products a query could plausibly mean, most specific first. */
export function candidateProducts(query: CorridorQuery): string[] {
  if (query.product) return PRODUCT_FAMILY[query.product] ?? [query.product];
  if (query.sourceAsset && query.destinationCurrency) return ["off_ramp", "payout"];
  if (query.destinationCurrency) return ["payout", "off_ramp"];
  if (query.sourceAsset) return ["on_ramp", "off_ramp", "wallet"];
  return ["payout", "off_ramp", "on_ramp"];
}

export function evaluateProvider(
  provider: ProviderInput,
  query: CorridorQuery,
  options: EvaluationOptions = {},
): Evaluation {
  const now = options.now ?? new Date();
  const wanted = candidateProducts(query);
  const matchedProduct = wanted.find((p) => provider.products.includes(p)) ?? null;

  const reasons: EligibilityReason[] = [];
  const dependedOn: CapabilityFacet[] = [];
  // Which requested dimensions have real, independent proof — populated as
  // each section below finds a `supported` fact, read back only by the
  // route-confirmation gate at the end. A dimension never enters this set on
  // a `partial` or missing fact — only an unambiguous "yes".
  const confirmedDims = new Set<string>();
  // Held in an object so the verdict survives mutation inside `downgrade`
  // without the compiler narrowing it to its initial value.
  const state: { verdict: EligibilityVerdict } = { verdict: "supported" };

  const downgrade = (next: EligibilityVerdict) => {
    const rank: Record<EligibilityVerdict, number> = {
      supported: 0,
      additional_requirements: 1,
      unknown: 2,
      unavailable: 3,
    };
    if (rank[next] > rank[state.verdict]) state.verdict = next;
  };

  if (!matchedProduct) {
    return {
      verdict: "unavailable",
      confidence: provider.lastVerifiedAt ? 0.9 : 0.6,
      band: confidenceBand(0.9, provider.lastVerifiedAt ?? undefined, now),
      reasons: [
        {
          code: "product_unavailable",
          message: `${provider.name} does not publish a ${productLabel(wanted[0]).toLowerCase()} product.`,
          alsoTrue: provider.products.length
            ? [`Published products: ${provider.products.map(productLabel).join(", ")}.`]
            : [],
          wouldChange: provider.products.length
            ? [`Search for ${productLabel(provider.products[0]).toLowerCase()} instead`]
            : [],
        },
      ],
      outstandingRequirements: [],
      lastVerifiedAt: provider.lastVerifiedAt,
      matchedProduct: null,
      evidence: [],
      receivingMode: null,
      operationalReadiness: options.operationalReadiness ?? "not_tested",
      // No matching product at all — not even a plausible route to rate the evidence for.
      routeConfirmation: "unknown",
      confirmedDimensions: [],
      unconfirmedDimensions: [],
      dependedOnRouteId: null,
      entityEligibility: null,
    };
  }

  const facets = provider.facets.filter((f) => f.product === matchedProduct);
  // An atomic provider_routes row deliberately carries several dimensions.
  // It must be visible to every relevant check, while broad capability facts
  // retain the one-family behavior that prevents accidental Cartesian joins.
  const byFamily = (family: Family) => facets.filter((f) => {
    if (familyOf(f) === family) return true;
    if (!f.isAtomicRoute) return false;
    return (family === "entity" && Boolean(f.entityCountry)) ||
      (family === "customer_type" && Boolean(f.customerType)) ||
      (family === "asset" && Boolean(f.sourceAsset)) ||
      (family === "network" && Boolean(f.sourceNetwork)) ||
      (family === "corridor" && Boolean(f.destinationCountry));
  });

  /* ---- 1. entity jurisdiction (a separate fact from route confirmation, see EntityEligibility) ---- */
  let entityEligibility: EntityEligibility | null = null;
  if (query.entityCountry) {
    entityEligibility = "unknown";
    const rows = byFamily("entity").filter(
      (f) =>
        f.entityCountry === query.entityCountry &&
        (!f.customerType || f.customerType === query.customerType),
    );
    const unsupported = rows.find((r) => r.availability === "unsupported");
    const partial = rows.find((r) => r.availability === "partial");
    const supported = rows.find((r) => r.availability === "supported");

    if (unsupported) {
      dependedOn.push(unsupported);
      downgrade("unavailable");
      entityEligibility = "unsupported";
      const otherEntities = [
        ...new Set(
          byFamily("entity")
            .filter((f) => f.availability === "supported")
            .map((f) => f.entityCountry!),
        ),
      ].slice(0, 4);
      reasons.push({
        code: "entity_jurisdiction_unsupported",
        message:
          unsupported.note ??
          `${countryName(query.entityCountry)}-incorporated ${
            query.customerType === "business" ? "businesses" : "customers"
          } are not currently accepted for this product.`,
        alsoTrue: query.destinationCountry
          ? [`${countryName(query.destinationCountry)} recipient accounts are supported.`]
          : [],
        wouldChange: otherEntities.length
          ? [`An entity incorporated in ${otherEntities.map(countryName).join(", ")}`]
          : [],
      });
    } else if (partial) {
      dependedOn.push(partial);
      downgrade("additional_requirements");
      entityEligibility = "partially_confirmed";
      reasons.push({
        code: "requirements_outstanding",
        message:
          partial.note ??
          `${provider.name} accepts ${countryName(query.entityCountry)} entities with additional documentation.`,
        alsoTrue: [],
        wouldChange: [],
      });
    } else if (supported) {
      dependedOn.push(supported);
      confirmedDims.add("entityCountry");
      entityEligibility = "confirmed";
    } else {
      downgrade("unknown");
      reasons.push({
        code: "no_data",
        message: `Railor has no verified statement about ${countryName(
          query.entityCountry,
        )}-incorporated entities for this product.`,
        alsoTrue: [],
        wouldChange: ["Check the provider's onboarding documentation directly"],
      });
    }
  }

  /* ---- 2. customer type ------------------------------------------------ */
  const customerRows = byFamily("customer_type");
  if (customerRows.length) {
    const ok = customerRows.some(
      (f) => f.customerType === query.customerType && f.availability !== "unsupported",
    );
    if (!ok) {
      downgrade("unavailable");
      reasons.push({
        code: "customer_type_unsupported",
        message: `${provider.name} does not serve ${
          query.customerType === "business" ? "business" : "individual"
        } customers on this product.`,
        alsoTrue: [
          `Serves: ${[...new Set(customerRows.map((f) => f.customerType))].join(", ")}.`,
        ],
        wouldChange: [
          `Switch customer type to ${query.customerType === "business" ? "individual" : "business"}`,
        ],
      });
    }
  }

  /* ---- 3. asset + network ---------------------------------------------- */
  if (query.sourceAsset) {
    // A complete route facet can carry an asset *and* a destination. Do not
    // discard it merely because `familyOf` classifies it as a corridor.
    const rows = facets.filter((f) => f.sourceAsset === query.sourceAsset);
    if (!rows.length) {
      downgrade("unknown");
      const supportedAssets = [...new Set(facets.map((f) => f.sourceAsset).filter((a): a is string => Boolean(a)))];
      reasons.push({
        code: "no_data",
        message: `Railor has no verified statement that ${provider.name} settles ${query.sourceAsset} for this product.`,
        alsoTrue: supportedAssets.length ? [`Supported assets: ${supportedAssets.join(", ")}.`] : [],
        wouldChange: supportedAssets.length ? [`Send ${supportedAssets[0]} instead`] : [],
      });
    } else {
      dependedOn.push(rows[0]!);
      confirmedDims.add("sourceAsset");
    }
  }

  if (query.sourceNetwork) {
    // Same for an exact asset/network/corridor row: it is evidence of its
    // network without becoming a separately-combinable network assertion.
    const rows = facets.filter((f) => f.sourceNetwork === query.sourceNetwork);
    if (!rows.length) {
      downgrade("unknown");
      const supportedNetworks = [...new Set(facets.map((f) => f.sourceNetwork).filter((n): n is string => Boolean(n)))];
      reasons.push({
        code: "no_data",
        message: `Railor has no verified statement that ${provider.name} accepts ${query.sourceNetwork} for this product.`,
        alsoTrue: supportedNetworks.length
          ? [`Supported networks: ${supportedNetworks.join(", ")}.`]
          : [],
        wouldChange: supportedNetworks.length ? [`Use ${supportedNetworks[0]}`] : [],
      });
    } else {
      dependedOn.push(rows[0]!);
      confirmedDims.add("sourceNetwork");
    }
  }

  if (query.sourceCurrency) {
    const rows = facets.filter((f) => f.sourceCurrency === query.sourceCurrency);
    if (!rows.length) {
      downgrade("unknown");
      const currencies = [...new Set(facets.map((f) => f.sourceCurrency).filter((c): c is string => Boolean(c)))];
      reasons.push({
        code: "no_data",
        message: `Railor has no verified statement that ${provider.name} accepts ${query.sourceCurrency} as funding currency for this product.`,
        alsoTrue: currencies.length ? [`Known funding currencies: ${currencies.join(", ")}.`] : [],
        wouldChange: currencies.length ? [`Fund in ${currencies[0]}`] : [],
      });
    } else {
      dependedOn.push(rows[0]!);
      confirmedDims.add("sourceCurrency");
    }
  }

  /* ---- 4. destination corridor ----------------------------------------- */
  if (query.destinationCountry) {
    const inCountry = byFamily("corridor").filter(
      (f) => f.destinationCountry === query.destinationCountry,
    );
    if (!inCountry.length) {
      downgrade("unknown");
      const countries = [
        ...new Set(byFamily("corridor").map((f) => f.destinationCountry!)),
      ].slice(0, 5);
      reasons.push({
        code: "no_data",
        message: `Railor has no verified payout statement for ${countryName(query.destinationCountry)} from ${provider.name}.`,
        alsoTrue: countries.length
          ? [`Publishes payouts into ${countries.map(countryName).join(", ")}.`]
          : [],
        wouldChange: [],
      });
    } else {
      const byCurrency = query.destinationCurrency
        ? inCountry.filter((f) => f.destinationCurrency === query.destinationCurrency)
        : inCountry;

      if (!byCurrency.length) {
        downgrade("unknown");
        const currencies = [...new Set(inCountry.map((f) => f.destinationCurrency!))];
        reasons.push({
          code: "no_data",
          message: `Railor has no verified ${query.destinationCurrency} payout statement for ${countryName(query.destinationCountry)} from ${provider.name}.`,
          alsoTrue: currencies.length ? [`Settles in ${currencies.join(", ")}.`] : [],
          wouldChange: currencies.length ? [`Settle in ${currencies[0]}`] : [],
        });
      } else {
        const byMethod = query.paymentMethod
          ? byCurrency.filter((f) => f.paymentMethod === query.paymentMethod)
          : byCurrency;

        if (!byMethod.length) {
          downgrade("unknown");
          const methods = [...new Set(byCurrency.map((f) => f.paymentMethod!))];
          reasons.push({
            code: "no_data",
            message: `Railor has no verified ${methodLabel(query.paymentMethod)} payout statement for this destination from ${provider.name}.`,
            alsoTrue: methods.length
              ? [`Available rails: ${methods.map(methodLabel).join(", ")}.`]
              : [],
            wouldChange: methods.length ? [`Use ${methodLabel(methods[0])}`] : [],
          });
          dependedOn.push(byCurrency[0]!);
        } else {
          // Endpoint type (bank_account/mobile_money/...) and named rail
          // (SEPA_INSTANT, MPESA, ...) are two independent axes on the same
          // receiving-endpoint fact — narrow by each only when the query asks
          // for it, so a query with neither still evaluates exactly as before.
          const byEndpointType = query.endpointType
            ? byMethod.filter((f) => f.endpointType === query.endpointType)
            : byMethod;

          if (!byEndpointType.length) {
            downgrade("unknown");
            const endpointTypes = [...new Set(byMethod.map((f) => f.endpointType).filter((t): t is string => Boolean(t)))];
            reasons.push({
              code: "no_data",
              message: `Railor has no verified statement that ${provider.name} delivers to a ${endpointLabel(query.endpointType)} for this destination.`,
              alsoTrue: endpointTypes.length ? [`Available endpoint types: ${endpointTypes.map(endpointLabel).join(", ")}.`] : [],
              wouldChange: endpointTypes.length ? [`Request a ${endpointLabel(endpointTypes[0])} instead`] : [],
            });
            dependedOn.push(byMethod[0]!);
          } else {
            const byNamedRail = query.namedRail
              ? byEndpointType.filter((f) => f.namedRailCode === query.namedRail)
              : byEndpointType;

            if (!byNamedRail.length) {
              downgrade("unknown");
              const rails = [...new Set(byEndpointType.map((f) => f.namedRailName ?? f.namedRailCode).filter((r): r is string => Boolean(r)))];
              reasons.push({
                code: "no_data",
                message: `Railor has no verified statement that ${provider.name} uses ${query.namedRail} for this destination.`,
                alsoTrue: rails.length ? [`Named rails on record: ${rails.join(", ")}.`] : [`${provider.name} does not name a specific rail for this destination.`],
                wouldChange: rails.length ? [`Ask for ${rails[0]} instead`] : [],
              });
              dependedOn.push(byEndpointType[0]!);
            } else {
              const unsupported = byNamedRail.find((f) => f.availability === "unsupported");
              const partial = byNamedRail.find((f) => f.availability === "partial");
              const supported = byNamedRail.find((f) => f.availability === "supported");
              if (unsupported) {
                dependedOn.push(unsupported);
                downgrade("unavailable");
                reasons.push({
                  code: "customer_country_unsupported",
                  message: unsupported.note ?? `This corridor is marked unsupported by ${provider.name}.`,
                  alsoTrue: [],
                  wouldChange: [],
                });
              } else if (partial) {
                dependedOn.push(partial);
                downgrade("additional_requirements");
                reasons.push({
                  code: "requirements_outstanding",
                  message: partial.note ?? `${provider.name} supports this corridor with conditions.`,
                  alsoTrue: [],
                  wouldChange: [],
                });
              } else if (supported) {
                dependedOn.push(supported);
                confirmedDims.add("destinationCountry");
                if (query.destinationCurrency) confirmedDims.add("destinationCurrency");
                if (query.paymentMethod) confirmedDims.add("paymentMethod");
                if (query.endpointType) confirmedDims.add("endpointType");
                if (query.namedRail) confirmedDims.add("namedRail");
              }
            }
          }
        }
      }
    }
  }

  /*
   * A country list, an asset list, and a network list are three independent
   * provider statements — not proof that their Cartesian product works. Run
   * this after the individual checks so explicit exclusions (for example, an
   * ineligible entity country) remain the first and clearest explanation.
   */
  // entityCountry deliberately excluded from this list — it is always present
  // on a real PaymentIntent (see @railor/types), so including it here would
  // make routeConfirmation depend on jurisdiction, exactly the coupling this
  // model removes. A route worth confirming is one that names an actual
  // transport dimension, not merely who is asking.
  const routeDimensionsRequested = Boolean(
    query.destinationCountry &&
      (query.sourceCountry || query.sourceAsset || query.sourceNetwork || query.sourceCurrency ||
        query.sourceEndpointType || query.sourceNamedRail),
  );
  let routeConfirmation: RouteConfirmation | null = null;
  let confirmedDimensions: string[] = [];
  let unconfirmedDimensions: string[] = [];
  let dependedOnRouteId: string | null = null;
  if (routeDimensionsRequested) {
    const requestedKeys = ROUTE_DIMENSION_KEYS.filter((k) => query[k as keyof CorridorQuery] !== undefined);
    const exactRouteRows = facets.filter(
      (f) =>
        f.isAtomicRoute === true &&
        f.destinationCountry === query.destinationCountry &&
        // entityCountry is compatible, not required-equal: a route silent on
        // jurisdiction (the overwhelming real-world case — see this file's
        // module doc) makes no claim either way, so it transports for any
        // entity country; a route that explicitly names one only transports
        // for that one. Preserves a genuine "this corridor is jurisdiction-
        // gated" fact without forcing every route to state a jurisdiction it
        // never actually addressed. Whether the entity itself may use this
        // provider at all is EntityEligibility's question, not this one's.
        (f.entityCountry === null || f.entityCountry === query.entityCountry) &&
        (!query.customerType || f.customerType === query.customerType) &&
        (!query.sourceCountry || f.sourceCountry === query.sourceCountry) &&
        (!query.sourceEndpointType || f.sourceEndpointType === query.sourceEndpointType) &&
        (!query.sourceNamedRail || f.sourceNamedRail === query.sourceNamedRail) &&
        (!query.destinationCurrency || f.destinationCurrency === query.destinationCurrency) &&
        (!query.sourceAsset || f.sourceAsset === query.sourceAsset) &&
        (!query.sourceNetwork || f.sourceNetwork === query.sourceNetwork) &&
        (!query.sourceCurrency || f.sourceCurrency === query.sourceCurrency) &&
        (!query.paymentMethod || f.paymentMethod === query.paymentMethod) &&
        (!query.endpointType || f.endpointType === query.endpointType) &&
        (!query.namedRail || f.namedRailCode === query.namedRail),
    );
    const exactSupported = exactRouteRows.find((f) => f.availability === "supported");
    const exactPartial = exactRouteRows.find((f) => f.availability === "partial");
    const exactUnsupported = exactRouteRows.find((f) => f.availability === "unsupported");

    if (exactUnsupported) {
      dependedOn.push(exactUnsupported);
      downgrade("unavailable");
      routeConfirmation = "unsupported";
      confirmedDimensions = requestedKeys.map((k) => DIMENSION_LABEL[k]!);
      dependedOnRouteId = exactUnsupported.id;
      reasons.push({
        code: "customer_country_unsupported",
        message: exactUnsupported.note ?? `This exact route is marked unsupported by ${provider.name}.`,
        alsoTrue: [],
        wouldChange: [],
      });
    } else if (exactPartial) {
      dependedOn.push(exactPartial);
      downgrade("additional_requirements");
      // A single atomic row proves the whole tuple — with conditions attached to
      // that proof, not with gaps in it. Confirmed at the evidence level.
      routeConfirmation = "confirmed";
      confirmedDimensions = requestedKeys.map((k) => DIMENSION_LABEL[k]!);
      dependedOnRouteId = exactPartial.id;
      reasons.push({
        code: "requirements_outstanding",
        message: exactPartial.note ?? `${provider.name} supports this exact route with conditions.`,
        alsoTrue: [],
        wouldChange: [],
      });
    } else if (exactSupported) {
      dependedOn.push(exactSupported);
      routeConfirmation = "confirmed";
      confirmedDimensions = requestedKeys.map((k) => DIMENSION_LABEL[k]!);
      dependedOnRouteId = exactSupported.id;
    } else {
      downgrade("unknown");
      const confirmedKeys = requestedKeys.filter((k) => confirmedDims.has(k));
      const missingKeys = requestedKeys.filter((k) => !confirmedDims.has(k));
      confirmedDimensions = confirmedKeys.map((k) => DIMENSION_LABEL[k]!);
      unconfirmedDimensions = missingKeys.map((k) => DIMENSION_LABEL[k]!);

      // An explicit unsupported hit anywhere upstream (entity, corridor,
      // currency, rail...) already pushed the verdict to "unavailable" — that
      // is a provider *saying no*, a stronger and different signal than
      // Railor simply lacking proof either way.
      routeConfirmation = state.verdict === "unavailable"
        ? "unsupported"
        : confirmedKeys.length === 0
          ? "unconfirmed"
          : "partially_confirmed";

      reasons.push({
        code: "no_data",
        message: `${provider.name} publishes individual capability facts, but Railor has no verified statement for this exact route combination.`,
        alsoTrue: confirmedKeys.length
          ? [`Independently confirmed: ${confirmedDimensions.join(", ")}.`]
          : [],
        wouldChange: [
          ...(missingKeys.length ? [`Still unverified as one route: ${unconfirmedDimensions.join(", ")}.`] : []),
          "Verify this route through the provider's quote or route-configuration API",
        ],
      });
    }
  }

  /* ---- 5. amount vs published limits ----------------------------------- */
  if (query.amount !== undefined) {
    if (provider.limitMin !== undefined && query.amount < provider.limitMin) {
      downgrade("unavailable");
      reasons.push({
        code: "amount_below_minimum",
        message: `${provider.name} has a published minimum of ${provider.limitMin.toLocaleString()} for this product.`,
        alsoTrue: provider.limitSummary ? [provider.limitSummary] : [],
        wouldChange: [`Send at least ${provider.limitMin.toLocaleString()}`],
      });
    } else if (provider.limitMax !== undefined && query.amount > provider.limitMax) {
      downgrade("additional_requirements");
      reasons.push({
        code: "amount_above_maximum",
        message: `${query.amount.toLocaleString()} exceeds the published per-transaction maximum of ${provider.limitMax.toLocaleString()}; larger amounts need to be split or agreed with the provider.`,
        alsoTrue: provider.limitSummary ? [provider.limitSummary] : [],
        wouldChange: ["Split into multiple payouts"],
      });
    }
  }

  /* ---- 6. outstanding KYB requirements --------------------------------- */
  const satisfied = new Set(options.satisfiedRequirements ?? []);
  const outstanding = provider.requirementKeys.filter((k) => !satisfied.has(k));
  if (satisfied.size > 0 && outstanding.length > 0 && state.verdict === "supported") {
    downgrade("additional_requirements");
    reasons.push({
      code: "requirements_outstanding",
      message: `${outstanding.length} onboarding requirement${
        outstanding.length === 1 ? "" : "s"
      } from your profile ${outstanding.length === 1 ? "is" : "are"} still outstanding.`,
      alsoTrue: [],
      wouldChange: outstanding
        .slice(0, 3)
        .map((k) => `Provide ${provider.requirementLabels[k] ?? k}`),
    });
  }

  if (state.verdict === "supported" && !reasons.length) {
    reasons.push({
      code: "all_checks_passed",
      message: `${provider.name} publishes support for every dimension of this query.`,
      alsoTrue: [],
      wouldChange: [],
    });
  }

  const confidences = dependedOn.map((f) => facetConfidence(f, now));
  const confidence = confidences.length
    ? Math.round(Math.min(...confidences) * 100) / 100
    : state.verdict === "unknown"
      ? 0.4
      : 0.7;

  const verifiedDates = dependedOn
    .map((f) => f.lastVerifiedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    verdict: state.verdict,
    confidence,
    band: confidenceBand(confidence, verifiedDates[0] ?? provider.lastVerifiedAt ?? undefined, now),
    reasons,
    outstandingRequirements: satisfied.size > 0 ? outstanding : [],
    lastVerifiedAt: verifiedDates[0] ?? provider.lastVerifiedAt,
    matchedProduct,
    evidence: collectEvidence(dependedOn),
    receivingMode: receivingModeFrom(dependedOn),
    operationalReadiness: options.operationalReadiness ?? "not_tested",
    routeConfirmation,
    confirmedDimensions,
    unconfirmedDimensions,
    dependedOnRouteId,
    entityEligibility,
  };
}

/**
 * Whether a candidate is worth carrying into Decision/quote consideration at
 * all — a genuinely wider gate than `verdict`, which still conflates entity
 * jurisdiction into one shared signal for existing callers (see
 * EntityEligibility's doc comment). A candidate with a confirmed or
 * partially-confirmed transport route is decision-plausible even when
 * `verdict` reads "unknown" solely because entity-jurisdiction evidence
 * doesn't exist yet — whether that missing jurisdiction evidence should then
 * block the recommendation is a policy question (requireConfirmedEntityEligibility
 * in @railor/core's policy.ts), not a pre-filter question. An *explicit*
 * "unsupported" (entity or route) still excludes here exactly as before,
 * since `verdict` already downgrades to "unavailable" for either.
 */
export function isDecisionEligible(evaluation: Evaluation): boolean {
  if (evaluation.verdict === "supported" || evaluation.verdict === "additional_requirements") return true;
  if (evaluation.verdict !== "unknown") return false;
  return evaluation.routeConfirmation === "confirmed" || evaluation.routeConfirmation === "partially_confirmed";
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                     */
/* -------------------------------------------------------------------------- */

interface PresetWeights {
  cost: number;
  speed: number;
  onboarding: number;
  reliability: number;
  coverage: number;
  confidence: number;
}

const PRESETS: Record<RankingPreset, PresetWeights> = {
  balanced: { cost: 0.2, speed: 0.15, onboarding: 0.15, reliability: 0.25, coverage: 0.1, confidence: 0.15 },
  cheapest: { cost: 0.55, speed: 0.05, onboarding: 0.1, reliability: 0.15, coverage: 0.05, confidence: 0.1 },
  fastest: { cost: 0.1, speed: 0.5, onboarding: 0.05, reliability: 0.2, coverage: 0.05, confidence: 0.1 },
  easiest_onboarding: { cost: 0.1, speed: 0.05, onboarding: 0.5, reliability: 0.15, coverage: 0.1, confidence: 0.1 },
  widest_coverage: { cost: 0.1, speed: 0.05, onboarding: 0.1, reliability: 0.15, coverage: 0.5, confidence: 0.1 },
  // Pre-connection, advertised fee bps is the best real proxy for what a
  // recipient would net — there is no live recipientAmount until a quote
  // exists (see routing.ts's rankQuotes for the real-quote version of this
  // preference, which uses actual recipientAmount instead of a proxy).
  max_recipient_amount: { cost: 0.5, speed: 0.05, onboarding: 0.05, reliability: 0.25, coverage: 0.05, confidence: 0.1 },
  most_reliable: { cost: 0.05, speed: 0.05, onboarding: 0.05, reliability: 0.65, coverage: 0.05, confidence: 0.15 },
};

/** Parses "AED payouts within 4 hours" → 240 minutes. Unknown → null. */
export function settlementMinutes(text: string | null): number | null {
  if (!text) return null;
  const m = text.toLowerCase().match(/(\d+)\s*(minute|min|hour|hr|day|business day)/);
  if (m?.[1] && m[2]) {
    const n = Number(m[1]);
    if (m[2].startsWith("min")) return n;
    if (m[2].startsWith("h")) return n * 60;
    return n * 60 * 24;
  }
  if (/instant/.test(text.toLowerCase())) return 1;
  if (/same (business )?day/.test(text.toLowerCase())) return 480;
  if (/t\+1/.test(text.toLowerCase())) return 1440;
  if (/t\+2/.test(text.toLowerCase())) return 2880;
  return null;
}

export interface ScoreResult {
  score: number;
  /** Fraction of the preset's total weight actually backed by real data (0-1). 1.0 means every factor was real; low means the score leans on eligibility/confidence alone because cost/speed/onboarding/reliability were all missing. */
  rankingConfidence: number;
  rankingInputsUsed: string[];
  rankingInputsMissing: string[];
}

/**
 * Eligibility is a gate, not a weight: an unavailable provider can never
 * outrank an available one regardless of price or speed.
 *
 * Missing data is never defaulted to a fabricated neutral 0.5 — a provider
 * with no published fee is not "medium-priced," it is unranked on cost. Each
 * factor either contributes real data or drops out of the weighted average
 * entirely, and the remaining weight is renormalized over whatever factors
 * *did* have data. `rankingConfidence` reports exactly how much of the
 * preset's weight that renormalization covered, so a caller can tell "this
 * 82 is backed by real fees and real settlement time" apart from "this 82 is
 * mostly eligibility confidence because nothing else was on file."
 */
export function scoreProvider(
  provider: ProviderInput,
  evaluation: Evaluation,
  preset: RankingPreset,
): ScoreResult {
  const w = PRESETS[preset];
  const norm = (value: number | null | undefined, best: number, worst: number): number | null => {
    if (value === null || value === undefined) return null;
    const clamped = Math.max(Math.min(value, worst), best);
    return 1 - (clamped - best) / (worst - best || 1);
  };

  const factors: Array<{ key: string; weight: number; value: number | null }> = [
    { key: "cost", weight: w.cost, value: norm(provider.feeCostBps ?? null, 20, 200) },
    { key: "speed", weight: w.speed, value: norm(settlementMinutes(provider.advertisedSettlement), 5, 2880) },
    { key: "onboarding", weight: w.onboarding, value: norm(provider.onboardingDays ?? null, 3, 45) },
    // healthOkRatio is null (not 1.0) when Railor has zero real health-check
    // observations — see ProviderInput's doc comment — so "no data" correctly
    // drops out here instead of masquerading as a perfect reliability record.
    { key: "reliability", weight: w.reliability, value: provider.healthOkRatio },
    // Always real, never "missing": a provider with zero known destinations
    // genuinely covers zero, which is a fact, not an absence of one.
    { key: "coverage", weight: w.coverage, value: Math.min(provider.destinationCountryCount / 8, 1) },
    { key: "confidence", weight: w.confidence, value: evaluation.confidence },
  ];

  const used = factors.filter((f): f is { key: string; weight: number; value: number } => f.value !== null);
  const totalWeight = used.reduce((sum, f) => sum + f.weight, 0);
  const raw = totalWeight > 0 ? used.reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight : 0;

  const gate =
    evaluation.verdict === "supported"
      ? 1
      : evaluation.verdict === "additional_requirements"
        ? 0.62
        : evaluation.verdict === "unknown"
          ? 0.3
          : 0.08;

  return {
    score: Math.round(raw * gate * 100),
    // Preset weights sum to 1.0, so the used weight is directly the covered fraction.
    rankingConfidence: Math.round(totalWeight * 100) / 100,
    rankingInputsUsed: used.map((f) => f.key),
    rankingInputsMissing: factors.filter((f) => f.value === null).map((f) => f.key),
  };
}
