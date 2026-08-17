/**
 * @railor/types — the shared domain vocabulary.
 *
 * Everything Railor publishes about the world flows through these shapes:
 * a structured query goes in, an eligibility verdict with evidence comes out.
 * If a value cannot be evidenced it is `unknown` — never guessed.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** ISO 3166-1 alpha-2, uppercase. */
export const CountryCode = z.string().length(2).regex(/^[A-Z]{2}$/);
/** ISO 4217, uppercase. */
export const CurrencyCode = z.string().length(3).regex(/^[A-Z]{3}$/);

export const CustomerType = z.enum(["business", "individual"]);
export type CustomerType = z.infer<typeof CustomerType>;

export const ProductType = z.enum([
  "on_ramp",
  "off_ramp",
  "payout",
  "collection",
  "virtual_account",
  "card_issuing",
  "card_funding",
  "wallet",
  "treasury",
  "kyc_kyb",
]);
export type ProductType = z.infer<typeof ProductType>;

export const PaymentMethod = z.enum([
  "bank_transfer_local",
  "bank_transfer_swift",
  "sepa",
  "faster_payments",
  "ach",
  "wire",
  "card",
  "wallet_transfer",
  "cash_pickup",
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/* -------------------------------------------------------------------------- */
/* Evidence & confidence                                                       */
/* -------------------------------------------------------------------------- */

export const SourceType = z.enum([
  "official_docs",
  "api",
  "pricing",
  "help_center",
  "terms",
  "status_page",
  "github",
  "official_announcement",
  "manual_verified",
  "third_party",
]);
export type SourceType = z.infer<typeof SourceType>;

/**
 * Base confidence by source type. Age decay is applied on read — see
 * `decayConfidence`. These numbers are deliberately conservative: an
 * inference is never allowed to reach the confidence of an official source.
 */
export const SOURCE_BASE_CONFIDENCE: Record<SourceType, number> = {
  api: 1.0,
  status_page: 0.98,
  official_docs: 0.95,
  help_center: 0.92,
  official_announcement: 0.9,
  manual_verified: 0.9,
  pricing: 0.9,
  terms: 0.88,
  github: 0.85,
  third_party: 0.6,
};

export const ConfidenceBand = z.enum([
  "verified",
  "high",
  "medium",
  "needs_review",
  "potentially_outdated",
]);
export type ConfidenceBand = z.infer<typeof ConfidenceBand>;

export const Evidence = z.object({
  id: z.string().optional(),
  sourceUrl: z.string().url(),
  sourceTitle: z.string(),
  sourceType: SourceType,
  retrievedAt: z.coerce.date(),
  lastVerifiedAt: z.coerce.date(),
  confidence: z.number().min(0).max(1),
  rawExcerpt: z.string().optional(),
  rawHash: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;

/** How a value came to exist. Model output is never labelled `verified`. */
export const Derivation = z.enum(["source", "manual", "model"]);
export type Derivation = z.infer<typeof Derivation>;

const DAY_MS = 86_400_000;

/**
 * Confidence decays with staleness so an 18-month-old "supported" never
 * outranks a fresh check. Half-life is source-type dependent: status pages
 * go stale in days, terms of service in months.
 */
export function decayConfidence(
  base: number,
  lastVerifiedAt: Date,
  sourceType: SourceType,
  now: Date = new Date(),
): number {
  const halfLifeDays =
    sourceType === "status_page" ? 7 : sourceType === "api" ? 30 : 120;
  const ageDays = Math.max(0, (now.getTime() - lastVerifiedAt.getTime()) / DAY_MS);
  const decayed = base * Math.pow(0.5, ageDays / halfLifeDays);
  return Math.round(Math.min(base, Math.max(0, decayed)) * 100) / 100;
}

export function confidenceBand(
  confidence: number,
  lastVerifiedAt?: Date,
  now: Date = new Date(),
): ConfidenceBand {
  if (lastVerifiedAt) {
    const ageDays = (now.getTime() - lastVerifiedAt.getTime()) / DAY_MS;
    if (ageDays > 180) return "potentially_outdated";
  }
  if (confidence >= 0.95) return "verified";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "needs_review";
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  verified: "Verified",
  high: "High confidence",
  medium: "Medium confidence",
  needs_review: "Needs review",
  potentially_outdated: "Potentially outdated",
};

/* -------------------------------------------------------------------------- */
/* Structured query — the object every surface speaks                          */
/* -------------------------------------------------------------------------- */

export const CorridorQuery = z.object({
  /** Where the *company* asking is incorporated. Drives entity eligibility. */
  entityCountry: CountryCode.optional(),
  customerType: CustomerType.default("business"),
  sourceCountry: CountryCode.optional(),
  destinationCountry: CountryCode.optional(),
  /** Stablecoin or fiat symbol being sent, e.g. USDC. */
  sourceAsset: z.string().optional(),
  sourceNetwork: z.string().optional(),
  destinationCurrency: CurrencyCode.optional(),
  paymentMethod: PaymentMethod.optional(),
  product: ProductType.optional(),
  amount: z.number().positive().optional(),
  amountCurrency: CurrencyCode.optional(),
});
export type CorridorQuery = z.infer<typeof CorridorQuery>;

/** Ranking presets. A user who configures nothing still gets a good answer. */
export const RankingPreset = z.enum([
  "balanced",
  "cheapest",
  "fastest",
  "easiest_onboarding",
  "widest_coverage",
]);
export type RankingPreset = z.infer<typeof RankingPreset>;

export const RANKING_PRESET_LABEL: Record<RankingPreset, string> = {
  balanced: "Balanced",
  cheapest: "Cheapest",
  fastest: "Fastest settlement",
  easiest_onboarding: "Easiest onboarding",
  widest_coverage: "Widest coverage",
};

/**
 * One interpreted token of a natural-language query. The UI renders these as
 * editable chips — correcting Railor is a click, never a re-type.
 */
export const QueryToken = z.object({
  field: z.enum([
    "entityCountry",
    "customerType",
    "sourceCountry",
    "destinationCountry",
    "sourceAsset",
    "sourceNetwork",
    "destinationCurrency",
    "paymentMethod",
    "product",
    "amount",
  ]),
  value: z.union([z.string(), z.number()]),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  /** Which words in the input produced this token. */
  matchedText: z.string().optional(),
  derivation: Derivation,
});
export type QueryToken = z.infer<typeof QueryToken>;

export const Interpretation = z.object({
  input: z.string(),
  query: CorridorQuery,
  tokens: z.array(QueryToken),
  /** Fields Railor could not determine — surfaced as "add this" chips. */
  missing: z.array(z.string()),
  interpreter: z.enum(["rules", "model", "rules+model"]),
});
export type Interpretation = z.infer<typeof Interpretation>;

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

export const EligibilityVerdict = z.enum([
  "supported",
  "additional_requirements",
  "unavailable",
  "unknown",
]);
export type EligibilityVerdict = z.infer<typeof EligibilityVerdict>;

export const VERDICT_LABEL: Record<EligibilityVerdict, string> = {
  supported: "Supported",
  additional_requirements: "Additional requirements",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

/** Why a verdict landed where it did. Never render a bare "Unsupported". */
export const EligibilityReason = z.object({
  code: z.enum([
    "entity_jurisdiction_unsupported",
    "customer_country_unsupported",
    "asset_unsupported",
    "network_unsupported",
    "currency_unsupported",
    "product_unavailable",
    "payment_method_unsupported",
    "customer_type_unsupported",
    "amount_below_minimum",
    "amount_above_maximum",
    "requirements_outstanding",
    "no_data",
    "all_checks_passed",
  ]),
  /** Plain-language sentence shown to the user. */
  message: z.string(),
  /** What is nonetheless true — prevents a dead end. */
  alsoTrue: z.array(z.string()).default([]),
  /** What the user could change to flip this verdict. */
  wouldChange: z.array(z.string()).default([]),
});
export type EligibilityReason = z.infer<typeof EligibilityReason>;

export const ProviderResult = z.object({
  provider: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    category: z.string(),
  }),
  eligibility: EligibilityVerdict,
  confidence: z.number().min(0).max(1),
  band: ConfidenceBand,
  lastVerifiedAt: z.coerce.date().nullable(),
  reasons: z.array(EligibilityReason),
  /** Requirements the org has not satisfied yet, when known. */
  outstandingRequirements: z.array(z.string()).default([]),
  facts: z
    .object({
      productLabel: z.string().optional(),
      feeSummary: z.string().optional(),
      limitSummary: z.string().optional(),
      settlementSummary: z.string().optional(),
      kybSummary: z.string().optional(),
    })
    .default({}),
  evidence: z.array(Evidence).default([]),
  /** Preset-dependent score, 0–100. Ineligible providers are never ranked up. */
  score: z.number().min(0).max(100).default(0),
});
export type ProviderResult = z.infer<typeof ProviderResult>;

export const CorridorSearchResult = z.object({
  query: CorridorQuery,
  preset: RankingPreset,
  providersChecked: z.number().int(),
  counts: z.object({
    supported: z.number().int(),
    additional_requirements: z.number().int(),
    unavailable: z.number().int(),
    unknown: z.number().int(),
  }),
  results: z.array(ProviderResult),
  generatedAt: z.coerce.date(),
});
export type CorridorSearchResult = z.infer<typeof CorridorSearchResult>;

/* -------------------------------------------------------------------------- */
/* Change events                                                               */
/* -------------------------------------------------------------------------- */

export const ChangeKind = z.enum([
  "coverage_changed",
  "requirement_changed",
  "pricing_changed",
  "limit_changed",
  "api_changed",
  "documentation_changed",
  "service_degraded",
  "product_launched",
  "product_removed",
]);
export type ChangeKind = z.infer<typeof ChangeKind>;

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  coverage_changed: "Coverage changed",
  requirement_changed: "Requirement changed",
  pricing_changed: "Pricing changed",
  limit_changed: "Limit changed",
  api_changed: "API changed",
  documentation_changed: "Documentation changed",
  service_degraded: "Service degraded",
  product_launched: "Product launched",
  product_removed: "Product removed",
};

export const ReviewStatus = z.enum(["pending", "approved", "rejected", "auto_published"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/* -------------------------------------------------------------------------- */
/* Onboarding + org profile                                                    */
/* -------------------------------------------------------------------------- */

export const BuildingType = z.enum([
  "payments",
  "wallet",
  "neobank",
  "marketplace",
  "card_program",
  "treasury",
  "stablecoin_infrastructure",
  "remittances",
  "other",
]);
export type BuildingType = z.infer<typeof BuildingType>;

export const InfrastructureInterest = z.enum([
  "stablecoin_to_fiat",
  "fiat_to_stablecoin",
  "cards",
  "bank_payouts",
  "collections",
  "virtual_accounts",
  "kyc_kyb",
  "treasury",
  "wallet_infrastructure",
]);
export type InfrastructureInterest = z.infer<typeof InfrastructureInterest>;

export const OnboardingAnswers = z.object({
  building: BuildingType.optional(),
  entityCountry: CountryCode.optional(),
  targetCountries: z.array(CountryCode).default([]),
  settlementCurrencies: z.array(CurrencyCode).default([]),
  interests: z.array(InfrastructureInterest).default([]),
  /** Steps the user skipped, recorded as explicit assumptions, never silent. */
  assumptions: z.array(z.string()).default([]),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>;

/* -------------------------------------------------------------------------- */
/* API envelope                                                                */
/* -------------------------------------------------------------------------- */

/** Every /v1 payload carries provenance. No claim ships without it. */
export interface RailorEnvelope<T> {
  object: string;
  data: T;
  evidence?: Evidence[];
  confidence?: number;
  last_verified_at?: string | null;
  request_id: string;
}

export const OrgRole = z.enum(["owner", "admin", "member", "viewer"]);
export type OrgRole = z.infer<typeof OrgRole>;
