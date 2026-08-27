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
  type Evidence,
  type RankingPreset,
  type SourceType,
} from "@railor/types";
import { COUNTRY_TERMS, METHOD_TERMS, PRODUCT_TERMS } from "./vocab.js";

export interface CapabilityFacet {
  id: string;
  product: string;
  entityCountry: string | null;
  customerCountry: string | null;
  customerType: string | null;
  sourceAsset: string | null;
  sourceNetwork: string | null;
  destinationCountry: string | null;
  destinationCurrency: string | null;
  paymentMethod: string | null;
  availability: "supported" | "partial" | "unsupported" | "unknown";
  note: string | null;
  lastVerifiedAt: Date | null;
  evidenceConfidence: number | null;
  evidenceSourceType: SourceType | null;
  evidenceId: string | null;
  evidenceUrl: string | null;
  evidenceTitle: string | null;
  evidenceRetrievedAt: Date | null;
  evidenceRawHash: string | null;
  evidenceExcerpt: string | null;
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
  healthOkRatio: number;
  destinationCountryCount: number;
}

export interface EvaluationOptions {
  /** Requirement keys the organization already holds, from its KYB profile. */
  satisfiedRequirements?: string[];
  now?: Date;
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
}

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

/** Facet families — a facet asserts only about the dimensions it names. */
type Family = "entity" | "customer_type" | "asset" | "network" | "corridor" | "other";

function familyOf(f: CapabilityFacet): Family {
  if (f.entityCountry) return "entity";
  if (f.destinationCountry) return "corridor";
  if (f.sourceAsset) return "asset";
  if (f.sourceNetwork) return "network";
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
    };
  }

  const facets = provider.facets.filter((f) => f.product === matchedProduct);
  const byFamily = (family: Family) => facets.filter((f) => familyOf(f) === family);

  /* ---- 1. entity jurisdiction ----------------------------------------- */
  if (query.entityCountry) {
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
    const rows = byFamily("asset").filter((f) => f.sourceAsset === query.sourceAsset);
    if (!rows.length) {
      downgrade("unavailable");
      const supportedAssets = [...new Set(byFamily("asset").map((f) => f.sourceAsset!))];
      reasons.push({
        code: "asset_unsupported",
        message: `${query.sourceAsset} is not listed among the assets ${provider.name} settles.`,
        alsoTrue: supportedAssets.length ? [`Supported assets: ${supportedAssets.join(", ")}.`] : [],
        wouldChange: supportedAssets.length ? [`Send ${supportedAssets[0]} instead`] : [],
      });
    } else {
      dependedOn.push(rows[0]!);
    }
  }

  if (query.sourceNetwork) {
    const rows = byFamily("network").filter((f) => f.sourceNetwork === query.sourceNetwork);
    if (!rows.length) {
      downgrade("unavailable");
      const supportedNetworks = [...new Set(byFamily("network").map((f) => f.sourceNetwork!))];
      reasons.push({
        code: "network_unsupported",
        message: `${provider.name} does not accept deposits on ${query.sourceNetwork}.`,
        alsoTrue: supportedNetworks.length
          ? [`Supported networks: ${supportedNetworks.join(", ")}.`]
          : [],
        wouldChange: supportedNetworks.length ? [`Use ${supportedNetworks[0]}`] : [],
      });
    } else {
      dependedOn.push(rows[0]!);
    }
  }

  /* ---- 4. destination corridor ----------------------------------------- */
  if (query.destinationCountry) {
    const inCountry = byFamily("corridor").filter(
      (f) => f.destinationCountry === query.destinationCountry,
    );
    if (!inCountry.length) {
      downgrade("unavailable");
      const countries = [
        ...new Set(byFamily("corridor").map((f) => f.destinationCountry!)),
      ].slice(0, 5);
      reasons.push({
        code: "customer_country_unsupported",
        message: `${provider.name} does not publish payouts into ${countryName(
          query.destinationCountry,
        )}.`,
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
        downgrade("unavailable");
        const currencies = [...new Set(inCountry.map((f) => f.destinationCurrency!))];
        reasons.push({
          code: "currency_unsupported",
          message: `${provider.name} settles into ${countryName(
            query.destinationCountry,
          )} but not in ${query.destinationCurrency}.`,
          alsoTrue: currencies.length ? [`Settles in ${currencies.join(", ")}.`] : [],
          wouldChange: currencies.length ? [`Settle in ${currencies[0]}`] : [],
        });
      } else {
        const byMethod = query.paymentMethod
          ? byCurrency.filter((f) => f.paymentMethod === query.paymentMethod)
          : byCurrency;

        if (!byMethod.length) {
          downgrade("additional_requirements");
          const methods = [...new Set(byCurrency.map((f) => f.paymentMethod!))];
          reasons.push({
            code: "payment_method_unsupported",
            message: `${provider.name} reaches ${query.destinationCurrency} accounts, but not over ${methodLabel(
              query.paymentMethod,
            )}.`,
            alsoTrue: methods.length
              ? [`Available rails: ${methods.map(methodLabel).join(", ")}.`]
              : [],
            wouldChange: methods.length ? [`Use ${methodLabel(methods[0])}`] : [],
          });
          dependedOn.push(byCurrency[0]!);
        } else {
          const unsupported = byMethod.find((f) => f.availability === "unsupported");
          const partial = byMethod.find((f) => f.availability === "partial");
          const supported = byMethod.find((f) => f.availability === "supported");
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
          }
        }
      }
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
  };
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

/**
 * Eligibility is a gate, not a weight: an unavailable provider can never
 * outrank an available one regardless of price or speed.
 */
export function scoreProvider(
  provider: ProviderInput,
  evaluation: Evaluation,
  preset: RankingPreset,
): number {
  const w = PRESETS[preset];
  const norm = (value: number | null | undefined, best: number, worst: number) => {
    if (value === null || value === undefined) return 0.5;
    const clamped = Math.max(Math.min(value, worst), best);
    return 1 - (clamped - best) / (worst - best || 1);
  };

  const cost = norm(provider.feeCostBps ?? null, 20, 200);
  const speed = norm(settlementMinutes(provider.advertisedSettlement), 5, 2880);
  const onboarding = norm(provider.onboardingDays ?? null, 3, 45);
  const reliability = provider.healthOkRatio;
  const coverage = Math.min(provider.destinationCountryCount / 8, 1);
  const confidence = evaluation.confidence;

  const raw =
    cost * w.cost +
    speed * w.speed +
    onboarding * w.onboarding +
    reliability * w.reliability +
    coverage * w.coverage +
    confidence * w.confidence;

  const gate =
    evaluation.verdict === "supported"
      ? 1
      : evaluation.verdict === "additional_requirements"
        ? 0.62
        : evaluation.verdict === "unknown"
          ? 0.3
          : 0.08;

  return Math.round(raw * gate * 100);
}
